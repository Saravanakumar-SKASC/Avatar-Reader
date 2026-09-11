'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { deleteBook, listBooks, listHistory, LOCAL_BOOKS_EVENT, updateBook } from '@/lib/books';
import type { BookRow } from '@/types/database';
import BookCard from '@/components/app/BookCard';
import PageHeader from '@/components/app/PageHeader';
import UploadDropzone from '@/components/book/UploadDropzone';
import { UploadIcon } from '@/components/app/icons';

export default function LibraryPage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [percent, setPercent] = useState<Record<string, number>>({});
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<BookRow | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const refresh = () => {
      void listBooks().then(setBooks).catch(() => {});
      void listHistory().then((h) => setPercent(Object.fromEntries(h.map((e) => [e.book.id, e.percent])))).catch(() => {});
    };
    refresh();
    window.addEventListener(LOCAL_BOOKS_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_BOOKS_EVENT, refresh);
  }, []);

  const shown = books.filter((b) => `${b.title ?? ''} ${b.author ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    await updateBook(editing.id, { title: String(fd.get('title') || '') || null, author: String(fd.get('author') || '') || null });
    setEditing(null);
    setBooks(await listBooks());
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader
        title="Library"
        subtitle={`${books.length} ${books.length === 1 ? 'book' : 'books'}`}
        actions={
          <>
            <input
              type="search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="hidden w-48 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-violet-200/40 focus:border-violet-400 focus:outline-none sm:block"
            />
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-violet-400"
            >
              <UploadIcon width={16} height={16} /> Add PDF
            </button>
          </>
        }
      />

      <div className="px-6 pb-10 lg:px-10">
        {shown.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <p className="text-sm text-violet-200/60">{books.length === 0 ? 'Your library is empty.' : 'No matches.'}</p>
            {books.length === 0 && <UploadDropzone onLoaded={(b) => router.push(`/read/${b.id}`)} />}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {shown.map((b) => (
              <BookCard
                key={b.id}
                book={b}
                percent={percent[b.id] ?? 0}
                onEdit={() => setEditing(b)}
                onDelete={() => {
                  if (confirm(`Remove "${b.title ?? 'this book'}" from your library?`)) void deleteBook(b.id).then(async () => setBooks(await listBooks()));
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="rounded-2xl bg-[#161226] p-6">
            <UploadDropzone onLoaded={(b) => router.push(`/read/${b.id}`)} onCancel={() => setShowUpload(false)} />
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form onSubmit={saveEdit} className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-[#161226] p-6">
            <h2 className="text-lg font-semibold text-white">Book details</h2>
            <label className="text-xs text-violet-200/60">
              Title
              <input name="title" defaultValue={editing.title ?? ''} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none" />
            </label>
            <label className="text-xs text-violet-200/60">
              Author
              <input name="author" defaultValue={editing.author ?? ''} placeholder="e.g. Paulo Coelho" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none" />
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm text-violet-200/70 hover:bg-white/5">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
