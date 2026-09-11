'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listHistory, LOCAL_BOOKS_EVENT } from '@/lib/books';
import type { HistoryEntry } from '@/lib/books/types';
import BookCover from '@/components/app/BookCover';
import PageHeader from '@/components/app/PageHeader';

function when(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 1) return 'just now';
  if (diff < 60) return `${Math.round(diff)} min ago`;
  if (diff < 60 * 24) return `${Math.round(diff / 60)} h ago`;
  return d.toLocaleDateString();
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    const refresh = () => void listHistory().then(setItems).catch(() => {});
    refresh();
    window.addEventListener(LOCAL_BOOKS_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_BOOKS_EVENT, refresh);
  }, []);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader title="History" subtitle="Everything you've listened to, most recent first." />
      <div className="px-6 pb-10 lg:px-10">
        {items.length === 0 ? (
          <p className="text-sm text-violet-200/60">Nothing yet — open a book to start your history.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((h) => (
              <li key={h.book.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <BookCover title={h.book.title ?? 'Untitled'} author={h.book.author} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/read/${h.book.id}`} className="block truncate text-sm font-medium text-white hover:underline">
                    {h.book.title ?? 'Untitled'}
                  </Link>
                  <div className="text-xs text-violet-200/60">
                    Page {h.page} of {h.book.page_count ?? '?'} · {when(h.openedAt)}
                  </div>
                </div>
                <div className="flex w-32 items-center gap-2">
                  <div className="h-1.5 flex-1 rounded bg-white/10">
                    <div className="h-1.5 rounded bg-violet-400" style={{ width: `${h.percent}%` }} />
                  </div>
                  <span className="w-9 text-right text-xs tabular-nums text-violet-200/70">{h.percent}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
