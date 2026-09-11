'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listBookmarks, listBooks, LOCAL_BOOKS_EVENT, removeBookmark } from '@/lib/books';
import type { BookRow, BookmarkRow } from '@/types/database';
import BookCover from '@/components/app/BookCover';
import PageHeader from '@/components/app/PageHeader';
import { TrashIcon } from '@/components/app/icons';

export default function BookmarksPage() {
  const [items, setItems] = useState<BookmarkRow[]>([]);
  const [books, setBooks] = useState<Map<string, BookRow>>(new Map());

  useEffect(() => {
    const refresh = () => {
      void listBookmarks().then(setItems).catch(() => {});
      void listBooks().then((b) => setBooks(new Map(b.map((x) => [x.id, x])))).catch(() => {});
    };
    refresh();
    window.addEventListener(LOCAL_BOOKS_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_BOOKS_EVENT, refresh);
  }, []);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader title="Bookmarks" subtitle="Pages you saved to come back to." />
      <div className="px-6 pb-10 lg:px-10">
        {items.length === 0 ? (
          <p className="text-sm text-violet-200/60">No bookmarks yet. Use the bookmark button in the reader.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((bm) => {
              const book = books.get(bm.book_id);
              const title = book?.title ?? 'Untitled';
              return (
                <li key={bm.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <BookCover title={title} author={book?.author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/read/${bm.book_id}?page=${bm.page ?? 1}`} className="block truncate text-sm font-medium text-white hover:underline">
                      {title} · page {bm.page ?? 1}
                    </Link>
                    <div className="truncate text-xs text-violet-200/60">{bm.note || new Date(bm.created_at).toLocaleString()}</div>
                  </div>
                  <button type="button" onClick={() => void removeBookmark(bm.id).then(() => listBookmarks().then(setItems))} title="Remove" className="rounded-md p-2 text-red-300 hover:bg-white/5">
                    <TrashIcon width={16} height={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
