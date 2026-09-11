'use client';

import Link from 'next/link';
import type { BookRow } from '@/types/database';
import BookCover from './BookCover';
import { PencilIcon, TrashIcon } from './icons';

export default function BookCard({
  book,
  percent,
  onEdit,
  onDelete,
}: {
  book: BookRow;
  percent?: number;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const title = book.title ?? 'Untitled';
  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-violet-400/40 hover:bg-white/[0.06]">
      <Link href={`/read/${book.id}`} className="flex justify-center">
        <BookCover title={title} author={book.author} />
      </Link>
      <div className="min-w-0">
        <Link href={`/read/${book.id}`} className="block truncate text-sm font-medium text-white hover:underline" title={title}>
          {title}
        </Link>
        <div className="truncate text-xs text-violet-200/60">{book.author ?? `${book.page_count ?? '?'} pages`}</div>
      </div>
      {percent !== undefined && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded bg-white/10">
            <div className="h-1.5 rounded bg-violet-400" style={{ width: `${percent}%` }} />
          </div>
          <span className="w-9 text-right text-[11px] tabular-nums text-violet-200/70">{percent}%</span>
        </div>
      )}
      {(onEdit || onDelete) && (
        <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
          {onEdit && (
            <button type="button" onClick={onEdit} title="Edit details" className="rounded-md bg-black/50 p-1.5 text-violet-100 hover:bg-black/70">
              <PencilIcon width={14} height={14} />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} title="Remove" className="rounded-md bg-black/50 p-1.5 text-red-300 hover:bg-black/70">
              <TrashIcon width={14} height={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
