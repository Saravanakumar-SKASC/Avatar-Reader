'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBook, loadProgress, saveProgress } from '@/lib/books';
import { DEFAULT_AVATAR_ID, getAvatar } from '@/lib/avatars';
import { splitIntoChunks, wordAtFraction, type Chunk } from '@/lib/tts/chunk';
import { clipKey, getClip, putClip, type Clip } from '@/lib/clip-cache';
import { wordAtTime } from '@/lib/timing/align';
import { paginate, type BookPage } from '@/lib/paginate';
import { getPageEmotions } from '@/lib/emotion/page-emotions';
import { cuesForChunk } from '@/lib/emotion/timeline';
import type { EmotionCue, EmotionSpan } from '@/lib/emotion/types';
import { OPEN_UPLOAD_EVENT } from '@/lib/events';
import AvatarPicker from '@/components/avatar/AvatarPicker';
import BookFrame from '@/components/book/BookFrame';
import UploadDropzone from '@/components/book/UploadDropzone';
import type { WordHighlight } from '@/components/book/BookViewer';
import type { LoadedBook } from '@/types/book';
import type { SpeakResponse, Viseme } from '@/types/tts';
import type { AvatarId } from '@/types/avatar';

// react-pageflip and three both touch `window` on import; never render them on the server.
const BookViewer = dynamic(() => import('@/components/book/BookViewer'), { ssr: false });
const AvatarCanvas = dynamic(() => import('@/components/avatar/AvatarCanvas'), { ssr: false });

const AVATAR_STORAGE_KEY = 'avatar-reader:avatar';
const SPEED_STORAGE_KEY = 'avatar-reader:speed';
const SPEEDS = [0.75, 1, 1.5, 2] as const;
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
  const startOnCoverRef = useRef(true); // rest on the cover until there's a saved position or reading starts

  // ----- avatar + voice (source of truth #2: avatarId) -----
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const voiceOverride = ''; // the selected avatar alone decides the voice
  const [speed, setSpeed] = useState<number>(1);
  const avatar = getAvatar(avatarId);

  // PDF pages re-flowed into book pages that fit the page box (nothing clipped).
  const [pages, setPages] = useState<BookPage[]>([]);
  useEffect(() => {
    setPages(book ? paginate(book.pages) : []);
  }, [book]);

  // ----- playback -----
  const [status, setStatus] = useState<Status>('idle');
  const [playRequest, setPlayRequest] = useState(0); // 0 = never asked to read; >0 = reading is armed
  const [progress, setProgress] = useState<{ ready: number; total: number } | null>(null);
  const [visemes, setVisemes] = useState<Viseme[]>([]);
  const [emotionCues, setEmotionCues] = useState<EmotionCue[]>([]);
  const pageEmotionsRef = useRef<{ page: number; timeline: EmotionSpan[] } | null>(null);
  const [meta, setMeta] = useState<SpeakMeta | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<WordHighlight | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentChunkRef = useRef<{ chunk: Chunk; page: number; words: Clip['words'] } | null>(null);
  const runRef = useRef<Run | null>(null);
  const idRef = useRef(0);

  const pageCount = pages.length;
  const pageText = pages[currentPage]?.text ?? '';

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
          setCurrentPage(page);
          lastSavedRef.current = page;
          startOnCoverRef.current = page === 0;
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

  useEffect(() => {
    if (pageCount > 0 && currentPage > pageCount - 1) setCurrentPage(pageCount - 1);
  }, [pageCount, currentPage]);

  // ----- remembered avatar / voice / speed -----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (saved) setAvatarId(getAvatar(saved).id);
      localStorage.removeItem('avatar-reader:voice-override'); // legacy override could pin one voice
      const sp = Number(localStorage.getItem(SPEED_STORAGE_KEY));
      if (SPEEDS.includes(sp as (typeof SPEEDS)[number])) setSpeed(sp);
    } catch {}
  }, []);

  // Speed = playbackRate: instant, keeps pitch, and needs no re-synthesis (cache stays valid).
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);
  const speedRef = useRef(speed);
  speedRef.current = speed;

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
    if (pageCount === 0) return;
    const t = setTimeout(() => {
      lastSavedRef.current = currentPage;
      void saveProgress(bookId, currentPage, pageCount);
    }, 500);
    return () => clearTimeout(t);
  }, [bookId, currentPage, pageCount]);

  const pageCountRef = useRef(pageCount);
  pageCountRef.current = pageCount;
  useEffect(() => {
    if (!bookId) return;
    const flush = () => {
      if (currentPageRef.current !== lastSavedRef.current && pageCountRef.current > 0) {
        lastSavedRef.current = currentPageRef.current;
        void saveProgress(bookId, currentPageRef.current, pageCountRef.current);
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
    setEmotionCues([]);
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
        audio.playbackRate = speedRef.current;
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
        currentChunkRef.current = { chunk, page, words: clip.words ?? null };
        setHighlight({ page, word: chunk.startWord, from: chunk.startWord, to: chunk.startWord + chunk.wordCount });
        const tl = pageEmotionsRef.current;
        setEmotionCues(tl && tl.page === page ? cuesForChunk(tl.timeline, chunk.startWord, chunk.wordCount, chunk.fractions) : []);
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
    if (!book || playRequest === 0 || pageCount === 0) return;

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
      const { audioBase64, visemes: cues, words, ...rest } = body as SpeakResponse;
      const clip: Clip = { audioBase64, visemes: cues, words: words ?? null, meta: rest };
      void putClip(key, clip);
      return clip;
    };

    setStatus('loading');
    setSpeakError(null);
    setProgress({ ready: 0, total: chunks.length });

    // Emotion timeline for this page — cached per (book, page) only; shared by every avatar.
    // Never blocks audio: if it lands mid-clip, the current clip's cues are refreshed.
    getPageEmotions(book.id, page, pageText, run.controller.signal)
      .then((timeline) => {
        if (stale()) return;
        pageEmotionsRef.current = { page, timeline };
        const cur = currentChunkRef.current;
        if (cur && cur.page === page) {
          setEmotionCues(cuesForChunk(timeline, cur.chunk.startWord, cur.chunk.wordCount, cur.chunk.fractions));
        }
      })
      .catch((err) => {
        if (!stale()) console.warn('[emotion] timeline unavailable, face stays neutral:', err instanceof Error ? err.message : err);
      });

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
        setHighlight(null);
        // Auto-advance: keep reading on the next page until the book ends.
        if (page + 1 < pageCount) {
          setCurrentPage(page + 1);
        } else {
          setStatus('idle');
        }
      } catch (err) {
        if (stale()) return;
        setSpeakError(err instanceof Error ? err.message : 'Speech failed');
        setStatus('error');
      }
    })();

    // Once this page is fully fetched, warm the cache for the next page (same run: cancelled on any change).
    Promise.allSettled(clipPromises).then(async () => {
      if (stale() || page + 1 >= pageCount) return;
      void getPageEmotions(book.id, page + 1, pages[page + 1].text, run.controller.signal).catch(() => {});
      const nextChunks = splitIntoChunks(pages[page + 1].text);
      for (let i = 0; i < nextChunks.length; i++) {
        if (stale()) return;
        await fetchClip(nextChunks[i], i, page + 1).catch(() => {});
      }
    });

    return () => run.controller.abort();
  }, [book, pages, pageCount, currentPage, pageText, avatarId, voiceOverride, playRequest, stopAudio, playClip]);

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
        // Measured Whisper timings when the clip has them; proportional estimate otherwise.
        const local =
          c.words && c.words.length === c.chunk.wordCount
            ? wordAtTime(c.words, a.currentTime)
            : wordAtFraction(c.chunk.fractions, a.currentTime / a.duration);
        const w = c.chunk.startWord + local;
        if (w !== last) {
          last = w;
          setHighlight({
            page: c.page,
            word: w,
            from: c.chunk.startWord,
            to: c.chunk.startWord + c.chunk.wordCount,
          });
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

  function changeSpeed(v: number) {
    setSpeed(v);
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, String(v));
    } catch {}
  }

  function openBook(b: LoadedBook) {
    resetPlayback();
    setCurrentPage(0);
    lastSavedRef.current = 0;
    startOnCoverRef.current = true;
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
      <main className="flex h-full items-center justify-center gap-3 text-gray-300">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        Loading book…
      </main>
    );
  }

  if (book === null) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-6 p-4 sm:p-8">
        <h1 className="text-3xl text-amber-50" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>Avatar Reader</h1>
        {params.bookId !== NEW_BOOK && (
          <p className="text-sm text-gray-400">{loadError ?? 'That book was not found.'} Load another:</p>
        )}
        <UploadDropzone onLoaded={openBook} />
      </main>
    );
  }

  const canPlay = pageText.trim().length > 0;
  const playLabel =
    status === 'loading' ? '…' : status === 'playing' ? '⏸' : '▶';
  const playTitle =
    status === 'loading' ? 'Loading' : status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play';

  return (
    <main className="flex h-full min-h-0 flex-col">
      {/* header */}
      <header className="flex shrink-0 items-center justify-center gap-4 px-14 pt-3 pb-1">
        <h1
          className="truncate text-xl text-amber-50/95"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: '0.01em' }}
          title={book.title ?? undefined}
        >
          {book.title ?? 'Untitled'}
        </h1>
        <button type="button" onClick={() => setShowUpload(true)} className="shrink-0 text-xs text-amber-100/60 underline-offset-2 hover:text-amber-100 hover:underline">
          Open another PDF
        </button>
      </header>

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

      {/* stage: avatar + book share the remaining height */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-3 overflow-hidden px-3 pb-2 sm:px-6 lg:flex-row lg:items-stretch lg:justify-center lg:gap-6">
        <div className="flex h-[30vh] w-full shrink-0 justify-center lg:h-full lg:w-[clamp(200px,26vw,400px)]">
          <AvatarCanvas
            avatar={avatar}
            visemes={visemes}
            emotionCues={emotionCues}
            audioRef={audioRef}
            className="h-full w-full max-w-[min(100%,calc(30vh*0.625))] overflow-hidden rounded-3xl bg-black/30 shadow-[0_20px_60px_rgba(0,0,0,.45)] ring-1 ring-white/10 lg:max-w-none"
          />
        </div>
        <div className="min-h-0 min-w-0 w-full flex-1 py-3 lg:max-w-[1200px]">
          {/* BookFrame sizes the container to the stage; the flip-book stretches into it */}
          <BookFrame>
            {(metrics) => (
              <BookViewer
                pages={pages.map((p) => p.text)}
                currentPage={currentPage}
                onFlip={setCurrentPage}
                highlight={highlight}
                metrics={metrics}
                title={book.title ?? 'Untitled'}
                author={book.author}
                startOnCover={startOnCoverRef.current}
              />
            )}
          </BookFrame>
        </div>
      </section>

      {/* control bar */}
      <footer className="shrink-0 border-t border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <AvatarPicker selectedId={avatarId} onSelect={selectAvatar} />

          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={currentPage === 0}
              title="Previous page (←)"
              className="h-10 w-10 rounded-full bg-white/10 text-lg hover:bg-white/20 disabled:opacity-30"
            >
              ⏮
            </button>
            <button
              onClick={togglePlay}
              disabled={!canPlay}
              title={canPlay ? `${playTitle} (space)` : 'No text on this page'}
              aria-pressed={status === 'playing'}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-xl text-black shadow-[0_0_24px_rgba(52,211,153,.45)] hover:bg-emerald-400 disabled:opacity-30"
            >
              {status === 'loading' ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              ) : (
                playLabel
              )}
            </button>
            <button
              onClick={goNext}
              disabled={currentPage >= pageCount - 1}
              title="Next page (→)"
              className="h-10 w-10 rounded-full bg-white/10 text-lg hover:bg-white/20 disabled:opacity-30"
            >
              ⏭
            </button>
            <span className="ml-1 w-24 text-center text-xs tabular-nums text-gray-300">
              Page {currentPage + 1} / {pageCount}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Speed">
            {SPEEDS.map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={speed === v}
                onClick={() => changeSpeed(v)}
                className={`rounded-full px-2.5 py-1 text-xs tabular-nums transition ${
                  speed === v ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                {v}×
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="h-4 text-[11px] text-gray-500">
              {status === 'loading' && progress
                ? `Preparing audio ${Math.min(progress.ready + 1, progress.total)}/${progress.total}`
                : meta && status !== 'error'
                  ? `${getAvatar(meta.avatarId).name} · ${meta.engineUsed === 'fish' ? 'Fish Audio' : 'Piper'}${
                      meta.emotionTag ? ` · ${meta.emotionTag}` : ''
                    }`
                  : ''}
            </span>
          </div>
        </div>

        {status === 'error' && speakError && (
          <div className="mx-auto mt-2 flex max-w-xl items-center justify-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
            <span className="truncate" title={speakError}>{speakError}</span>
            <button onClick={() => setPlayRequest((n) => n + 1)} className="shrink-0 rounded bg-red-500/30 px-2 py-1">
              Retry
            </button>
          </div>
        )}
      </footer>
    </main>
  );
}
