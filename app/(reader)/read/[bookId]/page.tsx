'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBook, loadProgress, saveProgress } from '@/lib/books';
import { DEFAULT_AVATAR_ID, getAvatar } from '@/lib/avatars';
import { splitIntoChunks, wordAtFraction, type Chunk } from '@/lib/tts/chunk';
import { clipKey, getClip, putClip, type Clip } from '@/lib/clip-cache';
import { OPEN_UPLOAD_EVENT } from '@/lib/events';
import AvatarPicker from '@/components/avatar/AvatarPicker';
import VoiceOverride from '@/components/avatar/VoiceOverride';
import ScaleToFit from '@/components/book/ScaleToFit';
import UploadDropzone from '@/components/book/UploadDropzone';
import type { WordHighlight } from '@/components/book/BookViewer';
import type { LoadedBook } from '@/types/book';
import type { SpeakResponse, Viseme } from '@/types/tts';
import type { AvatarId } from '@/types/avatar';

// react-pageflip and three both touch `window` on import; never render them on the server.
const BookViewer = dynamic(() => import('@/components/book/BookViewer'), { ssr: false });
const AvatarCanvas = dynamic(() => import('@/components/avatar/AvatarCanvas'), { ssr: false });

const AVATAR_STORAGE_KEY = 'avatar-reader:avatar';
const VOICE_STORAGE_KEY = 'avatar-reader:voice-override';
/** `/read/new` = reader with no book yet; the drop-zone is shown inline. */
const NEW_BOOK = 'new';
/** Parallel TTS requests per page. Fish rate-limits aggressive fan-out; 2 keeps it flowing. */
const CONCURRENCY = 2;

type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
type SpeakMeta = Clip['meta'];

/** One playback run = one (book, page, avatar, voice) combination. Superseded runs are inert. */
interface Run {
  id: number;
  controller: AbortController;
}

/** Runs async tasks with at most `limit` in flight, preserving result order. */
function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T>[] {
  let next = 0;
  const results: Promise<T>[] = [];
  const resolvers: ((v: T) => void)[] = [];
  const rejecters: ((e: unknown) => void)[] = [];
  for (let i = 0; i < tasks.length; i++) {
    results.push(new Promise<T>((res, rej) => {
      resolvers.push(res);
      rejecters.push(rej);
    }));
  }
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        resolvers[i](await tasks[i]());
      } catch (e) {
        rejecters[i](e);
      }
    }
  };
  for (let w = 0; w < Math.min(limit, tasks.length); w++) void worker();
  return results;
}

export default function ReadPage({ params }: { params: { bookId: string } }) {
  // ----- book + navigation (source of truth #1: currentPage) -----
  const [book, setBook] = useState<LoadedBook | null | undefined>(params.bookId === NEW_BOOK ? null : undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const lastSavedRef = useRef<number>(-1);

  // ----- avatar + voice (source of truth #2: avatarId) -----
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const [voiceOverride, setVoiceOverride] = useState('');
  const avatar = getAvatar(avatarId);

  // ----- playback -----
  const [status, setStatus] = useState<Status>('idle');
  const [playRequest, setPlayRequest] = useState(0); // 0 = never asked to read; >0 = reading is armed
  const [progress, setProgress] = useState<{ ready: number; total: number } | null>(null);
  const [visemes, setVisemes] = useState<Viseme[]>([]);
  const [meta, setMeta] = useState<SpeakMeta | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<WordHighlight | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentChunkRef = useRef<{ chunk: Chunk; page: number } | null>(null);
  const runRef = useRef<Run | null>(null);
  const idRef = useRef(0);

  const pageCount = book?.pages.length ?? 0;
  const pageText = book?.pages[currentPage] ?? '';

  // ----- load book + saved position (also when the sidebar switches books) -----
  useEffect(() => {
    if (params.bookId === NEW_BOOK) return;
    if (book && book.id === params.bookId) return; // opened inline; URL already points here
    let cancelled = false;
    (async () => {
      try {
        const [b, page] = await Promise.all([loadBook(params.bookId), loadProgress(params.bookId)]);
        if (cancelled) return;
        resetPlayback();
        if (b) {
          const clamped = Math.min(page, Math.max(0, b.pages.length - 1));
          setCurrentPage(clamped);
          lastSavedRef.current = clamped;
        }
        setBook(b);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load book');
          setBook(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.bookId]);

  // ----- remembered avatar / voice -----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (saved) setAvatarId(getAvatar(saved).id);
      setVoiceOverride(localStorage.getItem(VOICE_STORAGE_KEY) ?? '');
    } catch {}
  }, []);

  // ----- sidebar "Upload PDF" opens the drop-zone here instead of navigating -----
  useEffect(() => {
    const onOpen = (e: Event) => {
      e.preventDefault();
      if (book) setShowUpload(true);
    };
    window.addEventListener(OPEN_UPLOAD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_UPLOAD_EVENT, onOpen);
  }, [book]);

  // ----- persist reading position: debounced on flip, immediately on unmount / tab hide -----
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const bookId = book?.id ?? null;

  useEffect(() => {
    if (!bookId || currentPage === lastSavedRef.current) return;
    const t = setTimeout(() => {
      lastSavedRef.current = currentPage;
      void saveProgress(bookId, currentPage);
    }, 500);
    return () => clearTimeout(t);
  }, [bookId, currentPage]);

  useEffect(() => {
    if (!bookId) return;
    const flush = () => {
      if (currentPageRef.current !== lastSavedRef.current) {
        lastSavedRef.current = currentPageRef.current;
        void saveProgress(bookId, currentPageRef.current);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [bookId]);

  // ----- audio helpers -----
  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.onended = a.onplay = a.onpause = a.onerror = null;
      a.pause();
      a.removeAttribute('src');
    }
    audioRef.current = null;
    currentChunkRef.current = null;
    setVisemes([]);
    setHighlight(null);
  }, []);

  const resetPlayback = useCallback(() => {
    runRef.current?.controller.abort();
    runRef.current = null;
    idRef.current++;
    stopAudio();
    setPlayRequest(0);
    setStatus('idle');
    setProgress(null);
    setMeta(null);
    setSpeakError(null);
  }, [stopAudio]);

  /** Plays one chunk; resolves when it ends, or immediately with 'aborted' if the run is cancelled. */
  const playClip = useCallback(
    (clip: Clip, chunk: Chunk, page: number, run: Run) =>
      new Promise<'ended' | 'aborted'>((resolve) => {
        if (run.controller.signal.aborted) return resolve('aborted');
        const audio = new Audio(`data:audio/wav;base64,${clip.audioBase64}`);
        audio.onplay = () => setStatus('playing');
        audio.onpause = () => {
          if (!audio.ended) setStatus('paused');
        };
        audio.onended = () => resolve('ended');
        audio.onerror = () => {
          setSpeakError('Audio playback failed');
          setStatus('error');
          resolve('aborted');
        };
        run.controller.signal.addEventListener('abort', () => resolve('aborted'), { once: true });

        audioRef.current = audio; // set before publishing cues so the lip-sync loop reads this element's clock
        currentChunkRef.current = { chunk, page };
        setVisemes(clip.visemes);
        setMeta(clip.meta);
        setSpeakError(null);
        audio.play().catch((err: unknown) => {
          // Autoplay policy: only possible before the first user gesture. Leave it loaded; Play resumes it.
          console.warn('[reader] autoplay blocked', err);
          setStatus('paused');
        });
      }),
    []
  );

  /**
   * THE playback effect. (book, currentPage, avatarId, voiceOverride) is the single source of
   * truth for what should be heard. Any change: abort the in-flight run, stop the audio, then
   * serve the page's chunks from cache or fetch them (first chunk plays as soon as it's ready,
   * later ones stream in behind it). A run id + AbortController guarantee a stale response can
   * never start playing over what's current, and the next page is prefetched in the background.
   */
  useEffect(() => {
    if (!book || playRequest === 0) return;

    runRef.current?.controller.abort();
    const run: Run = { id: ++idRef.current, controller: new AbortController() };
    runRef.current = run;
    const stale = () => run.id !== idRef.current || run.controller.signal.aborted;
    stopAudio();

    const page = currentPage;
    const chunks = splitIntoChunks(pageText);
    if (chunks.length === 0) {
      setStatus('idle');
      setMeta(null);
      setProgress(null);
      return;
    }

    const fetchClip = async (chunk: Chunk, index: number, forPage: number): Promise<Clip> => {
      const key = clipKey({ bookId: book.id, page: forPage, chunk: index, avatarId, voice: voiceOverride, text: chunk.text });
      const cached = await getClip(key);
      if (cached) return cached;
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk.text, avatarId, voiceOverride: voiceOverride || undefined }),
        signal: run.controller.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        const detail = [body.fish, body.piper].filter(Boolean).join(' | ');
        throw new Error(detail ? `${body.error}: ${detail}` : body.error ?? `Request failed (${res.status})`);
      }
      const { audioBase64, visemes: cues, ...rest } = body as SpeakResponse;
      const clip: Clip = { audioBase64, visemes: cues, meta: rest };
      void putClip(key, clip);
      return clip;
    };

    setStatus('loading');
    setSpeakError(null);
    setProgress({ ready: 0, total: chunks.length });

    let ready = 0;
    const clipPromises = withConcurrency(
      chunks.map((c, i) => async () => {
        const clip = await fetchClip(c, i, page);
        if (!stale()) setProgress({ ready: ++ready, total: chunks.length });
        return clip;
      }),
      CONCURRENCY
    );

    // Play chunks in order as they become available.
    (async () => {
      try {
        for (let i = 0; i < chunks.length; i++) {
          if (i > 0) setStatus('loading'); // buffering the next chunk (instant if already fetched)
          const clip = await clipPromises[i];
          if (stale()) return;
          const outcome = await playClip(clip, chunks[i], page, run);
          if (outcome === 'aborted' || stale()) return;
        }
        setStatus('idle');
        setHighlight(null);
      } catch (err) {
        if (stale()) return;
        setSpeakError(err instanceof Error ? err.message : 'Speech failed');
        setStatus('error');
      }
    })();

    // Once this page is fully fetched, warm the cache for the next page (same run: cancelled on any change).
    Promise.allSettled(clipPromises).then(async () => {
      if (stale() || page + 1 >= book.pages.length) return;
      const nextChunks = splitIntoChunks(book.pages[page + 1]);
      for (let i = 0; i < nextChunks.length; i++) {
        if (stale()) return;
        await fetchClip(nextChunks[i], i, page + 1).catch(() => {});
      }
    });

    return () => run.controller.abort();
  }, [book, currentPage, pageText, avatarId, voiceOverride, playRequest, stopAudio, playClip]);

  // Stop everything on unmount.
  useEffect(() => () => resetPlayback(), [resetPlayback]);

  // ----- word highlight: follow the playing chunk's clock -----
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const a = audioRef.current;
      const c = currentChunkRef.current;
      if (a && c && !a.paused && !a.ended && a.duration > 0) {
        const w = c.chunk.startWord + wordAtFraction(c.chunk.fractions, a.currentTime / a.duration);
        if (w !== last) {
          last = w;
          setHighlight({ page: c.page, word: w });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ----- user actions -----
  function togglePlay() {
    const a = audioRef.current;
    if (a && !a.ended && runRef.current && runRef.current.id === idRef.current) {
      // Toggle only — never fetch here.
      if (a.paused) void a.play();
      else a.pause();
      return;
    }
    // Nothing loaded / page finished / failed: (re)start this page.
    setPlayRequest((n) => n + 1);
  }

  function selectAvatar(id: AvatarId) {
    setAvatarId(id);
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, id);
    } catch {}
    // With a book open, picking an avatar means "read this page in that voice" — arm playback.
    if (book && playRequest === 0) setPlayRequest(1);
  }

  function changeVoiceOverride(referenceId: string) {
    setVoiceOverride(referenceId);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, referenceId);
    } catch {}
  }

  function openBook(b: LoadedBook) {
    resetPlayback();
    setCurrentPage(0);
    lastSavedRef.current = 0;
    setLoadError(null);
    setBook(b);
    setShowUpload(false);
    // Keep the URL shareable without a navigation / remount.
    window.history.replaceState(null, '', `/read/${b.id}`);
  }

  const goPrev = useCallback(() => setCurrentPage((p) => Math.max(0, p - 1)), []);
  const goNext = useCallback(() => setCurrentPage((p) => Math.min(pageCount - 1, p + 1)), [pageCount]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showUpload || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === ' ' && book) {
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ----- render -----
  if (book === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 text-gray-300">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        Loading book…
      </main>
    );
  }

  if (book === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">Avatar Reader</h1>
        {params.bookId !== NEW_BOOK && (
          <p className="text-sm text-gray-400">{loadError ?? 'That book was not found.'} Load another:</p>
        )}
        <UploadDropzone onLoaded={openBook} />
      </main>
    );
  }

  const canPlay = pageText.trim().length > 0;
  const playLabel =
    status === 'loading' ? 'Loading…' : status === 'playing' ? '⏸ Pause' : status === 'paused' ? '▶ Resume' : '▶ Play';

  return (
    <main className="flex min-h-screen flex-col items-center gap-5 p-4 sm:p-8">
      <div className="flex w-full items-center justify-center gap-4">
        <h1 className="truncate text-lg font-medium">{book.title ?? 'Untitled'}</h1>
        <button type="button" onClick={() => setShowUpload(true)} className="shrink-0 text-xs text-gray-400 underline">
          Open another PDF
        </button>
      </div>

      {showUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}
        >
          <div className="rounded-2xl bg-neutral-900 p-6">
            <UploadDropzone onLoaded={openBook} onCancel={() => setShowUpload(false)} />
          </div>
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-5 xl:flex-row xl:items-start xl:justify-center">
        <AvatarCanvas
          avatar={avatar}
          visemes={visemes}
          audioRef={audioRef}
          className="h-[360px] w-full max-w-[360px] shrink-0 rounded-2xl bg-black/30 xl:h-[640px] xl:w-[400px] xl:max-w-none"
        />
        {/* react-pageflip needs fixed pixel dimensions; scale the whole book down on narrow screens */}
        <ScaleToFit pageWidth={480} pageHeight={640}>
          {(orientation) => (
            <BookViewer
              pages={book.pages}
              currentPage={currentPage}
              onFlip={setCurrentPage}
              highlight={highlight}
              orientation={orientation}
            />
          )}
        </ScaleToFit>
      </div>

      <AvatarPicker selectedId={avatarId} onSelect={selectAvatar} />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button onClick={goPrev} disabled={currentPage === 0} className="rounded bg-white/10 px-4 py-2 disabled:opacity-40">
          ← Prev
        </button>
        <span className="tabular-nums text-sm text-gray-300">
          Page {currentPage + 1} of {pageCount}
        </span>
        <button
          onClick={goNext}
          disabled={currentPage >= pageCount - 1}
          className="rounded bg-white/10 px-4 py-2 disabled:opacity-40"
        >
          Next →
        </button>
        <button
          onClick={togglePlay}
          disabled={!canPlay}
          aria-pressed={status === 'playing'}
          className="min-w-32 rounded bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500 disabled:opacity-40"
        >
          {canPlay ? playLabel : 'No text on this page'}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        {status === 'loading' && progress && (
          <span className="flex items-center gap-2 text-xs text-gray-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            Preparing audio {Math.min(progress.ready + 1, progress.total)}/{progress.total}
          </span>
        )}
        <VoiceOverride value={voiceOverride} onChange={changeVoiceOverride} />
        {meta && status !== 'error' && (
          <span className="text-xs text-gray-500">
            {getAvatar(meta.avatarId).name} ·{' '}
            {meta.engineUsed === 'fish'
              ? `Fish Audio${meta.emotionTag ? ` · ${meta.emotionTag}` : ''}`
              : 'Piper (local)'}
          </span>
        )}
        {status === 'error' && speakError && (
          <div className="flex max-w-md flex-col items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-center text-sm text-red-200">
            <span>{speakError}</span>
            <button onClick={() => setPlayRequest((n) => n + 1)} className="rounded bg-red-500/30 px-3 py-1 text-xs">
              Retry
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
