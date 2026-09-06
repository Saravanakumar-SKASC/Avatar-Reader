'use client';

import Link from 'next/link';
import UploadButton from './UploadButton';
import { useEffect, useState } from 'react';
import { deleteLocalBook, listLocalBooks, LOCAL_BOOKS_EVENT, localProgressPercent } from '@/lib/books/local';
import type { BookRow } from '@/types/database';

export default function LocalLibrarySidebar() {
  const [books, setBooks] = useState<BookRow[]>([]);

  useEffect(() => {
    const refresh = () => setBooks(listLocalBooks());
    refresh();
    window.addEventListener(LOCAL_BOOKS_EVENT, refresh);
    window.addEventListener('storage', refresh); // other tabs
    return () => {
      window.removeEventListener(LOCAL_BOOKS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-4 border-r border-white/10 bg-black/40 p-4 text-white backdrop-blur-md">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Library</h2>
      </div>

      <UploadButton />

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {books.length === 0 && <li className="text-xs text-gray-500">No books yet.</li>}
        {books.map((b) => {
          const pct = localProgressPercent(b);
          return (
            <li key={b.id} className="group relative">
              <Link href={`/read/${b.id}`} className="block rounded p-2 pr-7 hover:bg-white/10">
                <div className="truncate text-sm" title={b.title ?? undefined}>
                  {b.title ?? 'Untitled'}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded bg-white/10">
                    <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-9 text-right text-xs tabular-nums text-gray-400">{pct}%</span>
                </div>
              </Link>
              <button
                type="button"
                aria-label={`Remove ${b.title ?? 'book'}`}
                title="Remove from library"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Remove "${b.title ?? 'this book'}" from your library?`)) deleteLocalBook(b.id);
                }}
                className="absolute right-1 top-2 hidden rounded px-1.5 text-xs text-gray-400 hover:bg-white/10 hover:text-white group-hover:block"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
