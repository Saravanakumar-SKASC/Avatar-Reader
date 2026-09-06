'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { loadBook } from '@/lib/book-store';
import type { StoredBook } from '@/types/book';

// react-pageflip touches `window` on import; it must never render on the server.
const BookViewer = dynamic(() => import('@/components/book/BookViewer'), { ssr: false });

export default function ReadPage({ params }: { params: { bookId: string } }) {
  const [book, setBook] = useState<StoredBook | null | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setBook(loadBook(params.bookId));
  }, [params.bookId]);

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

      <BookViewer pages={book.pages} currentPage={currentPage} onFlip={setCurrentPage} />

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
    </main>
  );
}
