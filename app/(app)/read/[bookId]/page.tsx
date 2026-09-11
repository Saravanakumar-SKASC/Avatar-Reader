'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addBookmark,
  listBookmarks,
  listBooks,
  loadBook,
  loadProgress,
  saveProgress,
  touchHistory,
  removeBookmark,
} from '@/lib/books';
import { DEFAULT_AVATAR_ID, getAvatar } from '@/lib/avatars';
import { splitIntoChunks, wordAtFraction, type Chunk } from '@/lib/tts/chunk';
import { clipKey, getClip, putClip, type Clip } from '@/lib/clip-cache';
import { wordAtTime } from '@/lib/timing/align';
import { paginate, PAGE_BOX, type BookPage } from '@/lib/paginate';
import { FONT_SIZES, getSettings, SETTINGS_EVENT, updateSettings, type FontSize } from '@/lib/local/settings';
import { getPageEmotions } from '@/lib/emotion/page-emotions';
import { cuesForChunk } from '@/lib/emotion/timeline';
import type { EmotionCue, EmotionSpan } from '@/lib/emotion/types';
import AvatarPicker from '@/components/avatar/AvatarPicker';
import ProfileMenu from '@/components/app/ProfileMenu';
import BookCover from '@/components/app/BookCover';
import {
  ArrowLeftIcon,
  BookmarkIcon,
  ChevronIcon,
  ListIcon,
  PauseIcon,
  PlayIcon,
  SkipIcon,
  SpeakerIcon,
} from '@/components/app/icons';
import BookFrame from '@/components/book/BookFrame';
import UploadDropzone from '@/components/book/UploadDropzone';
import type { WordHighlight } from '@/components/book/BookViewer';
import type { LoadedBook } from '@/types/book';
import type { SpeakResponse, Viseme } from '@/types/tts';
import type { AvatarId } from '@/types/avatar';
import type { BookRow, BookmarkRow } from '@/types/database';

// react-pageflip and three both touch `window` on import; never render them on the server.
const BookViewer = dynamic(() => import('@/components/book/BookViewer'), { ssr: false });
const AvatarCanvas = dynamic(() => import('@/components/avatar/AvatarCanvas'), { ssr: false });

const AVATAR_STORAGE_KEY = 'avatar-reader:avatar';
const SPEED_STORAGE_KEY = 'avatar-reader:speed';
const VOLUME_STORAGE_KEY = 'avatar-reader:volume';
const SPEEDS = [0.75, 1, 1.5, 2] as const;
/** `/read/new` = reader with no book yet; the drop-zone is shown inline. */
const NEW_BOOK = 'new';
/** Parallel TTS requests per page. Fish rate-limits aggressive fan-out; 2 keeps it flowing. */
const CONCURRENCY = 2;
/** Rough speaking rate, used to estimate the length of chunks that haven't been generated yet. */
const CHARS_PER_SECOND = 14.5;

function speedRefValue(s: number): number {
  return s > 0 ? s : 1;
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

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
  const [showContents, setShowContents] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [otherBooks, setOtherBooks] = useState<BookRow[]>([]);
  const [fontSize, setFontSize] = useState<FontSize>('M');
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [pageTime, setPageTime] = useState({ elapsed: 0, total: 0 });
  const searchParams = useSearchParams();
  const lastSavedRef = useRef<number>(-1);
  const startOnCoverRef = useRef(true); // rest on the cover until there's a saved position or reading starts

  // ----- avatar + voice (source of truth #2: avatarId) -----
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const voiceOverride = ''; // the selected avatar alone decides the voice
  const [speed, setSpeed] = useState<number>(1);
  const [volume, setVolume] = useState<number>(1); // 0..1; 0 = muted
  const lastAudibleRef = useRef(1); // restored when un-muting
  const avatar = getAvatar(avatarId);

  // PDF pages re-flowed into book pages that fit the page box (nothing clipped).
  // The box tracks the reader's text-size setting, so pagination and the rendered page agree.
  const pageBox = useMemo(
    () => ({
      ...PAGE_BOX,
      font: `${FONT_SIZES[fontSize].px}px Georgia, 'Times New Roman', serif`,
      lineHeight: FONT_SIZES[fontSize].lineHeight,
    }),
    [fontSize]
  );
  const [pages, setPages] = useState<BookPage[]>([]);
  useEffect(() => {
    setPages(book ? paginate(book.pages, pageBox) : []);
  }, [book, pageBox]);

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
  /** Same split the playback engine uses — memoised so the scrubber can measure the page. */
  const chunks = useMemo(() => splitIntoChunks(pageText), [pageText]);
  /** Real clip durations once known; estimated from text length until then. */
  const durationsRef = useRef<number[]>([]);
  const chunkIndexRef = useRef(0);
  /** Set by the scrubber; consumed by the playback effect on its next run. */
  const seekRef = useRef<{ chunk: number; offset: number } | null>(null);

  const estimate = useCallback((i: number) => (chunks[i] ? chunks[i].text.length / CHARS_PER_SECOND : 0), [chunks]);
  const chunkDuration = useCallback((i: number) => durationsRef.current[i] ?? estimate(i), [estimate]);
  const pageDuration = useMemo(
    () => chunks.reduce((sum, _c, i) => sum + (durationsRef.current[i] ?? _c.text.length / CHARS_PER_SECOND), 0) / speedRefValue(speed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chunks, speed, pageTime]
  );

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
          // ?page=N (from Bookmarks) wins over the saved position.
          const deep = Number(searchParams.get('page'));
          const target = Number.isFinite(deep) && deep > 0 ? Math.round(deep) - 1 : page;
          setCurrentPage(target);
          lastSavedRef.current = target;
          startOnCoverRef.current = target === 0;
          void touchHistory(b.id).catch(() => {});
          void listBookmarks(b.id).then(setBookmarks).catch(() => {});
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

  // ----- reader settings (text size, default narrator, captions) -----
  const [settings, setSettings] = useState(() => ({ autoAdvance: true, captions: true }));
  useEffect(() => {
    const refresh = () => {
      const s = getSettings();
      setFontSize(s.fontSize);
      setSettings({ autoAdvance: s.autoAdvance, captions: s.captions });
    };
    refresh();
    window.addEventListener(SETTINGS_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_EVENT, refresh);
  }, []);

  useEffect(() => {
    void listBooks().then(setOtherBooks).catch(() => {});
  }, []);

  // ----- remembered avatar / voice / speed -----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
      const preferred = getSettings().defaultAvatar;
      if (preferred) setAvatarId(getAvatar(preferred).id);
      else if (saved) setAvatarId(getAvatar(saved).id);
      localStorage.removeItem('avatar-reader:voice-override'); // legacy override could pin one voice
      const sp = Number(localStorage.getItem(SPEED_STORAGE_KEY));
      if (SPEEDS.includes(sp as (typeof SPEEDS)[number])) setSpeed(sp);
      const vol = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (vol !== null && !Number.isNaN(Number(vol))) {
        const v = Math.min(1, Math.max(0, Number(vol)));
        setVolume(v);
        if (v > 0) lastAudibleRef.current = v;
      }
    } catch {}
  }, []);

  // Speed = playbackRate: instant, keeps pitch, and needs no re-synthesis (cache stays valid).
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // Volume is applied to the playing element and to every new clip; it never touches the cache.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

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
    (clip: Clip, chunk: Chunk, page: number, run: Run, index: number, offset = 0) =>
      new Promise<'ended' | 'aborted'>((resolve) => {
        if (run.controller.signal.aborted) return resolve('aborted');
        const audio = new Audio(`data:audio/wav;base64,${clip.audioBase64}`);
        audio.playbackRate = speedRef.current;
        audio.volume = volumeRef.current;
        chunkIndexRef.current = index;
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration)) {
            durationsRef.current[index] = audio.duration;
            setPageTime((t) => ({ ...t })); // nudge the scrubber's total
          }
          if (offset > 0) audio.currentTime = Math.min(offset, audio.duration || offset);
        };
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
    const seek = seekRef.current;
    seekRef.current = null;
    if (!seek) durationsRef.current = [];
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
        for (let i = seek?.chunk ?? 0; i < chunks.length; i++) {
          if (i > 0) setStatus('loading'); // buffering the next chunk (instant if already fetched)
          const clip = await clipPromises[i];
          if (stale()) return;
          const outcome = await playClip(clip, chunks[i], page, run, i, i === seek?.chunk ? seek.offset : 0);
          if (outcome === 'aborted' || stale()) return;
        }
        setHighlight(null);
        // Auto-advance: keep reading on the next page until the book ends.
        if (settings.autoAdvance && page + 1 < pageCount) {
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
  }, [book, pages, pageCount, currentPage, pageText, chunks, settings.autoAdvance, avatarId, voiceOverride, playRequest, stopAudio, playClip]);

  // Stop everything on unmount.
  useEffect(() => () => resetPlayback(), [resetPlayback]);

  // ----- word highlight: follow the playing chunk's clock -----
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const a = audioRef.current;
      const c = currentChunkRef.current;
      if (a && c && a.duration > 0) {
        const before = chunks.slice(0, chunkIndexRef.current).reduce((sum, _x, i) => sum + (durationsRef.current[i] ?? _x.text.length / CHARS_PER_SECOND), 0);
        const el = (before + a.currentTime) / speedRefValue(speedRef.current);
        setPageTime((t) => (Math.abs(t.elapsed - el) > 0.2 ? { ...t, elapsed: el } : t));
      }
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
  }, [chunks]);

  // Page changed: the scrubber starts over.
  useEffect(() => {
    setPageTime({ elapsed: 0, total: 0 });
    chunkIndexRef.current = 0;
  }, [currentPage, avatarId]);

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

  function changeVolume(v: number) {
    const clamped = Math.min(1, Math.max(0, v));
    setVolume(clamped);
    if (clamped > 0) lastAudibleRef.current = clamped;
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {}
  }

  function toggleMute() {
    changeVolume(volume > 0 ? 0 : lastAudibleRef.current || 1);
  }

  /** Seek anywhere in the current page's narration: jump to the right chunk and offset. */
  function seekToFraction(fraction: number) {
    if (!chunks.length || !pageDuration) return;
    let target = Math.max(0, Math.min(1, fraction)) * pageDuration * speedRefValue(speedRef.current);
    let index = 0;
    while (index < chunks.length - 1 && target > chunkDuration(index)) {
      target -= chunkDuration(index);
      index++;
    }
    const a = audioRef.current;
    if (a && index === chunkIndexRef.current && a.duration > 0) {
      a.currentTime = Math.min(target, a.duration);
      return;
    }
    seekRef.current = { chunk: index, offset: target };
    setPlayRequest((n) => n + 1);
  }

  const bookmarked = bookmarks.some((b) => b.page === currentPage + 1);
  async function toggleBookmark() {
    if (!book) return;
    const existing = bookmarks.find((b) => b.page === currentPage + 1);
    if (existing) await removeBookmark(existing.id);
    else await addBookmark(book.id, currentPage + 1, pageText.slice(0, 80));
    setBookmarks(await listBookmarks(book.id));
  }

  function changeFontSize(v: FontSize) {
    setFontSize(v);
    updateSettings({ fontSize: v });
    setShowFontMenu(false);
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
      <main className="flex h-full items-center justify-center gap-3 text-violet-200/70">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        Opening your book…
      </main>
    );
  }

  if (book === null) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-6 p-4 sm:p-8">
        <h1 className="font-serif text-3xl text-amber-50">Start a new story</h1>
        {params.bookId !== NEW_BOOK && (
          <p className="text-sm text-violet-200/60">{loadError ?? 'That book was not found.'} Load another:</p>
        )}
        <UploadDropzone onLoaded={openBook} />
      </main>
    );
  }

  const canPlay = pageText.trim().length > 0;
  const playing = status === 'playing';
  const percent = pageCount ? Math.round(((currentPage + 1) / pageCount) * 100) : 0;
  const caption = currentChunkRef.current?.chunk.text ?? '';
  const nextBook = otherBooks.find((b) => b.id !== book.id) ?? null;
  const remaining = Math.max(0, pageDuration - pageTime.elapsed);

  return (
    <main className="flex h-full min-h-0 flex-col">
      {/* ---------- top bar ---------- */}
      <header className="flex shrink-0 items-center gap-3 px-2 py-2 pl-12 lg:px-4 lg:pl-12">
        <Link
          href="/library"
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm text-violet-100/80 transition hover:bg-white/5 hover:text-white"
        >
          <ArrowLeftIcon width={16} height={16} />
          <span className="hidden sm:inline">Back to Library</span>
        </Link>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate font-serif text-lg text-white" title={book.title ?? undefined}>
            {book.title ?? 'Untitled'}
          </h1>
          <p className="truncate text-xs text-violet-200/60">{book.author ?? 'Unknown author'}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFontMenu((v) => !v)}
              aria-label="Text size"
              aria-expanded={showFontMenu}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 font-serif text-sm text-violet-100 hover:bg-white/10"
            >
              Aa
            </button>
            {showFontMenu && (
              <div className="absolute right-0 top-12 z-50 flex gap-1 rounded-xl border border-white/10 bg-[#161226] p-1.5 shadow-2xl">
                {(Object.keys(FONT_SIZES) as FontSize[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => changeFontSize(k)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${fontSize === k ? 'bg-white text-[#1a1530]' : 'text-violet-100/80 hover:bg-white/10'}`}
                  >
                    {FONT_SIZES[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowContents(true)}
            aria-label="Contents"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-violet-100 hover:bg-white/10"
          >
            <ListIcon width={18} height={18} />
          </button>

          <button
            type="button"
            onClick={toggleBookmark}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            aria-pressed={bookmarked}
            className={`flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 ${bookmarked ? 'bg-violet-500/25 text-violet-200' : 'bg-white/5 text-violet-100'}`}
          >
            <BookmarkIcon width={18} height={18} filled={bookmarked} />
          </button>

          <ProfileMenu />
        </div>
      </header>

      {/* ---------- body ---------- */}
      <div className="grid min-h-0 flex-1 gap-3 px-2 pb-2 lg:px-4 min-[1700px]:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-h-0 flex-col gap-3">
          {/* stage: book + narrator */}
          <section className="reading-stage grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_clamp(160px,16vw,260px)]">
            <div className="min-h-0 min-w-0">
              {/* CSS vars go on the frame itself — an extra wrapper would break height:100%
                  and page-flip would size its pages from the wrong box. */}
              <BookFrame
                style={
                  {
                    ['--leaf-font-size' as string]: `${FONT_SIZES[fontSize].px}px`,
                    ['--leaf-line-height' as string]: `${FONT_SIZES[fontSize].lineHeight}px`,
                  } as React.CSSProperties
                }
              >
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

            <div className="avatar-niche relative hidden min-h-0 lg:block">
              <AvatarCanvas
                avatar={avatar}
                visemes={visemes}
                emotionCues={emotionCues}
                audioRef={audioRef}
                className="h-full w-full"
              />
              {settings.captions && playing && caption && (
                <div className="speech-bubble absolute left-4 right-4 top-4 z-10 flex gap-2 rounded-2xl px-3 py-2">
                  <SpeakerIcon width={16} height={16} className="mt-0.5 shrink-0 text-violet-300" />
                  <p className="line-clamp-3 text-xs leading-relaxed text-violet-50/90">{caption}</p>
                </div>
              )}
              <div className="absolute bottom-3 left-0 right-0 z-10 text-center text-xs text-amber-100/70">
                {avatar.name} · {avatar.personality}
              </div>
            </div>
          </section>

          {/* player bar */}
          <footer className="shrink-0 rounded-2xl border border-white/10 bg-[#150f27]/80 px-4 py-2.5 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <div className="hidden min-w-[140px] flex-col sm:flex">
                <span className="text-[10px] uppercase tracking-wider text-violet-200/50">Narrator</span>
                <span className="truncate text-sm text-white">{avatar.name}</span>
                <span className="truncate text-[11px] text-violet-200/50">
                  {meta ? (meta.engineUsed === 'fish' ? 'Fish Audio' : 'Piper (local)') : avatar.personality}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={goPrev}
                  disabled={currentPage === 0}
                  title="Previous page (←)"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-violet-100 transition hover:bg-white/10 disabled:opacity-25"
                >
                  <SkipIcon dir="back" width={18} height={18} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!canPlay}
                  aria-pressed={playing}
                  title={canPlay ? (playing ? 'Pause (space)' : 'Play (space)') : 'No text on this page'}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white shadow-[0_0_28px_rgba(167,139,250,.55)] transition hover:brightness-110 disabled:opacity-30"
                >
                  {status === 'loading' ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : playing ? (
                    <PauseIcon width={22} height={22} />
                  ) : (
                    <PlayIcon width={22} height={22} />
                  )}
                </button>
                <button
                  onClick={goNext}
                  disabled={currentPage >= pageCount - 1}
                  title="Next page (→)"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-violet-100 transition hover:bg-white/10 disabled:opacity-25"
                >
                  <SkipIcon dir="forward" width={18} height={18} />
                </button>
              </div>

              {/* page narration scrubber */}
              <div className="flex min-w-[220px] flex-1 items-center gap-3">
                <span className="w-10 text-right text-[11px] tabular-nums text-violet-200/70">{clock(pageTime.elapsed)}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={pageDuration ? Math.min(1, pageTime.elapsed / pageDuration) : 0}
                  onChange={(e) => seekToFraction(Number(e.target.value))}
                  aria-label="Position in this page"
                  className="scrubber flex-1"
                  style={{
                    background: `linear-gradient(to right, #a78bfa ${pageDuration ? (pageTime.elapsed / pageDuration) * 100 : 0}%, rgba(255,255,255,.18) 0%)`,
                  }}
                />
                <span className="w-10 text-[11px] tabular-nums text-violet-200/70">{clock(pageDuration)}</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-violet-200/50">
                  Speed
                  <select
                    value={speed}
                    onChange={(e) => changeSpeed(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-[#161226] px-2 py-1.5 text-sm normal-case tracking-normal text-white focus:border-violet-400 focus:outline-none"
                  >
                    {SPEEDS.map((v) => (
                      <option key={v} value={v}>
                        {v}x
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-violet-100 hover:bg-white/10"
                  >
                    <SpeakerIcon level={volume === 0 ? 0 : volume < 0.5 ? 1 : 2} width={18} height={18} />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    aria-label="Volume"
                    className="volume-slider w-20"
                  />
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-violet-200/50">
              <span className="tabular-nums">
                Page {currentPage + 1} of {pageCount}
              </span>
              {status === 'loading' && progress && (
                <span className="flex items-center gap-1.5 text-violet-200/70">
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white/20 border-t-white" />
                  Preparing audio {Math.min(progress.ready + 1, progress.total)}/{progress.total}
                </span>
              )}
              {meta?.emotionTag && <span>{meta.emotionTag}</span>}
            </div>

            {status === 'error' && speakError && (
              <div className="mx-auto mt-2 flex max-w-xl items-center justify-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
                <span className="truncate" title={speakError}>
                  {speakError}
                </span>
                <button onClick={() => setPlayRequest((n) => n + 1)} className="shrink-0 rounded bg-red-500/30 px-2 py-1">
                  Retry
                </button>
              </div>
            )}
          </footer>

          {/* narrator carousel */}
          <section className="shrink-0 rounded-2xl border border-white/10 bg-[#150f27]/60 px-3 py-2 backdrop-blur-md">
            <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-violet-200/50">Choose your avatar</h2>
            <AvatarPicker selectedId={avatarId} onSelect={selectAvatar} />
          </section>
        </div>

        {/* ---------- right column ---------- */}
        <aside className="hidden min-h-0 flex-col gap-3 min-[1700px]:flex">
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-200/60">Up next</h2>
            {currentPage + 1 < pageCount ? (
              <div className="flex gap-3">
                <BookCover title={book.title ?? 'Untitled'} author={book.author} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{book.title ?? 'Untitled'}</div>
                  <div className="text-xs text-violet-200/60">Page {currentPage + 2}</div>
                  <div className="text-xs text-violet-200/50">Continue in {clock(remaining)}</div>
                </div>
              </div>
            ) : nextBook ? (
              <Link href={`/read/${nextBook.id}`} className="flex gap-3 hover:opacity-90">
                <BookCover title={nextBook.title ?? 'Untitled'} author={nextBook.author} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{nextBook.title ?? 'Untitled'}</div>
                  <div className="text-xs text-violet-200/60">Start reading</div>
                </div>
              </Link>
            ) : (
              <p className="text-xs text-violet-200/60">You&apos;ve reached the end. Add another book to keep going.</p>
            )}
            <Link
              href="/library"
              className="mt-4 block rounded-xl bg-white/10 px-3 py-2 text-center text-xs font-medium text-white hover:bg-white/15"
            >
              View Full Library
            </Link>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-violet-200/60">Reading progress</span>
              <span className="tabular-nums text-white">{percent}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-xs text-violet-200/60">
              Page {currentPage + 1} of {pageCount}
            </p>
          </section>

          {bookmarks.length > 0 && (
            <section className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-200/60">Bookmarks</h2>
              <ul className="flex flex-col gap-1.5">
                {bookmarks.slice(0, 8).map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(Math.max(0, (b.page ?? 1) - 1))}
                      className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-violet-100/80 hover:bg-white/5"
                    >
                      p.{b.page} · {b.note || 'Saved'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* ---------- contents slide-over ---------- */}
      {showContents && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={(e) => e.target === e.currentTarget && setShowContents(false)}>
          <div className="flex h-full w-80 flex-col border-l border-white/10 bg-[#150f27] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Contents</h2>
              <button type="button" onClick={() => setShowContents(false)} aria-label="Close" className="rounded-lg p-1.5 text-violet-200/70 hover:bg-white/5">
                <ChevronIcon dir="right" width={18} height={18} />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto pr-1">
              {pages.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage(i);
                      setShowContents(false);
                    }}
                    className={`w-full rounded-lg px-2 py-2 text-left transition hover:bg-white/5 ${i === currentPage ? 'bg-violet-500/20' : ''}`}
                  >
                    <span className="block text-[11px] text-violet-200/50">Page {i + 1}</span>
                    <span className="line-clamp-2 text-xs text-violet-100/80">{p.text.slice(0, 90) || '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="rounded-2xl bg-[#161226] p-6">
            <UploadDropzone onLoaded={openBook} onCancel={() => setShowUpload(false)} />
          </div>
        </div>
      )}
    </main>
  );
}
