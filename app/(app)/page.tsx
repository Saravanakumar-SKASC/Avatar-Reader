'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { listBooks, listHistory, LOCAL_BOOKS_EVENT } from '@/lib/books';
import type { HistoryEntry } from '@/lib/books/types';
import { getProfile } from '@/lib/local/profile';
import { AVATARS } from '@/lib/avatars';
import type { BookRow } from '@/types/database';
import BookCard from '@/components/app/BookCard';
import BookCover from '@/components/app/BookCover';
import PageHeader from '@/components/app/PageHeader';
import UploadDropzone from '@/components/book/UploadDropzone';
import { PlayIcon, SparkIcon } from '@/components/app/icons';

export default function HomePage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [name, setName] = useState('Reader');

  useEffect(() => {
    const refresh = () => {
      void listBooks().then(setBooks).catch(() => {});
      void listHistory().then(setHistory).catch(() => {});
    };
    refresh();
    setName(getProfile()?.name ?? 'Reader');
    window.addEventListener(LOCAL_BOOKS_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_BOOKS_EVENT, refresh);
  }, []);

  const current = history[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader title={`${greeting}, ${name}`} subtitle="Pick up where you left off, or start something new." />

      <div className="grid gap-6 px-6 pb-10 lg:grid-cols-[2fr_1fr] lg:px-10">
        {/* Continue reading */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/25 via-[#1a1530] to-[#120e22] p-6 shadow-2xl">
          {current ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <BookCover title={current.book.title ?? 'Untitled'} author={current.book.author} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-200/60">Continue reading</div>
                <h2 className="mt-1 truncate font-serif text-3xl text-white">{current.book.title ?? 'Untitled'}</h2>
                {current.book.author && <p className="text-violet-100/70">{current.book.author}</p>}
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" style={{ width: `${current.percent}%` }} />
                  </div>
                  <span className="text-sm tabular-nums text-violet-100/80">{current.percent}%</span>
                </div>
                <p className="mt-1 text-xs text-violet-200/60">
                  Page {current.page} of {current.book.page_count ?? '?'}
                </p>
                <Link
                  href={`/read/${current.book.id}`}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#1a1530] shadow-lg hover:bg-violet-50"
                >
                  <PlayIcon width={16} height={16} /> Resume listening
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <SparkIcon className="text-violet-300" width={36} height={36} />
              <h2 className="font-serif text-3xl text-white">Your first story awaits</h2>
              <p className="max-w-md text-sm text-violet-100/70">
                Drop a PDF and a narrator will read it to you, page by page, with expressions and a turning book.
              </p>
              <UploadDropzone onLoaded={(b) => router.push(`/read/${b.id}`)} />
            </div>
          )}
        </section>

        {/* Narrators */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-violet-200/60">Meet the narrators</h3>
          <ul className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-7 lg:grid-cols-4">
            {AVATARS.map((a) => (
              <li key={a.id} className="flex flex-col items-center gap-1 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbnailUrl} alt={a.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-white/10" />
                <span className="text-xs text-white">{a.name}</span>
                <span className="text-[10px] text-violet-200/60">{a.personality}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-violet-200/60">Each narrator has a distinct voice and mood. Switch mid-sentence any time.</p>
        </section>

        {/* Library */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-violet-200/60">Your library</h3>
            <Link href="/library" className="text-sm text-violet-300 hover:underline">
              View all
            </Link>
          </div>
          {books.length === 0 ? (
            <p className="text-sm text-violet-200/60">No books yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              {books.slice(0, 5).map((b) => (
                <BookCard key={b.id} book={b} percent={history.find((h) => h.book.id === b.id)?.percent} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
