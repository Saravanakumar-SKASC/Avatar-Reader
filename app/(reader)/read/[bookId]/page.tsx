'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBook } from '@/lib/book-store';
import { DEFAULT_AVATAR_ID, getAvatar } from '@/lib/avatars';
import AvatarPicker from '@/components/avatar/AvatarPicker';
import type { StoredBook } from '@/types/book';
import type { SpeakResponse } from '@/types/tts';
import type { AvatarId } from '@/types/avatar';

// react-pageflip and three both touch `window` on import; never render them on the server.
const BookViewer = dynamic(() => import('@/components/book/BookViewer'), { ssr: false });
const AvatarCanvas = dynamic(() => import('@/components/avatar/AvatarCanvas'), { ssr: false });

const AVATAR_STORAGE_KEY = 'avatar-reader:avatar';

export default function ReadPage({ params }: { params: { bookId: string } }) {
  const [book, setBook] = useState<StoredBook | null | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [engineUsed, setEngineUsed] = useState<SpeakResponse['engineUsed'] | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const avatar = getAvatar(avatarId);

  useEffect(() => {
    setBook(loadBook(params.bookId));
    try {
      const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (saved) setAvatarId(getAvatar(saved).id);
    } catch {}
  }, [params.bookId]);

  function selectAvatar(id: AvatarId) {
    setAvatarId(id);
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, id);
    } catch {}
  }

  // Stop any playing audio when the component unmounts.
  useEffect(() => () => audioRef.current?.pause(), []);

  async function playPage() {
    if (!book) return;
    audioRef.current?.pause();
    setSpeaking(true);
    setSpeakError(null);
    setEngineUsed(null);

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: book.pages[currentPage] }),
      });
      const body = await res.json();
      if (!res.ok) {
        const detail = [body.fish, body.piper].filter(Boolean).join(' | ');
        throw new Error(detail ? `${body.error}: ${detail}` : body.error ?? `Request failed (${res.status})`);
      }
      const { audioBase64, engineUsed: engine } = body as SpeakResponse;
      setEngineUsed(engine);

      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => {
        setSpeakError('Audio playback failed');
        setSpeaking(false);
      };
      await audio.play();
    } catch (err) {
      setSpeakError(err instanceof Error ? err.message : 'Speech failed');
      setSpeaking(false);
    }
  }

  const pageCount = book?.pages.length ?? 0;

  const goPrev = useCallback(() => setCurrentPage((p) => Math.max(0, p - 1)), []);
  const goNext = useCallback(
    () => setCurrentPage((p) => Math.min(pageCount - 1, p + 1)),
    [pageCount]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  if (book === undefined) {
    return <main className="p-8 text-gray-500">Loading book…</main>;
  }

  if (book === null) {
    return (
      <main className="p-8">
        <p className="mb-4">Book not found in this browser.</p>
        <Link href="/upload" className="underline">
          Upload a PDF
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-neutral-900 p-8 text-white">
      <h1 className="text-lg font-medium">{book.name}</h1>

      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
        <AvatarCanvas avatar={avatar} className="h-[420px] w-[320px] rounded-xl bg-neutral-800" />
        <BookViewer pages={book.pages} currentPage={currentPage} onFlip={setCurrentPage} />
      </div>

      <AvatarPicker selectedId={avatarId} onSelect={selectAvatar} />

      <div className="flex items-center gap-4">
        <button
          onClick={goPrev}
          disabled={currentPage === 0}
          className="rounded bg-white/10 px-4 py-2 disabled:opacity-40"
        >
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
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={playPage}
          disabled={speaking || !book.pages[currentPage]?.trim()}
          className="rounded bg-emerald-600 px-5 py-2 font-medium disabled:opacity-40"
        >
          {speaking ? 'Speaking…' : '▶ Play page'}
        </button>
        {engineUsed && (
          <span className="text-xs text-gray-400">
            engine: {engineUsed === 'fish' ? 'Fish Audio' : 'Piper (local fallback)'}
          </span>
        )}
        {speakError && <p className="max-w-md text-center text-sm text-red-400">{speakError}</p>}
      </div>
    </main>
  );
}
