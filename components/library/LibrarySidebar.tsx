import Link from 'next/link';
import UploadButton from './UploadButton';
import { createClient } from '@/lib/supabase/server';
import type { BookRow, ReadingProgressRow } from '@/types/database';
import SignOutButton from './SignOutButton';

function percent(progress: ReadingProgressRow | undefined, pageCount: number | null): number {
  if (!progress || !pageCount) return 0;
  return Math.min(100, Math.round((progress.current_page / pageCount) * 100));
}

export default async function LibrarySidebar({ email }: { email: string }) {
  const supabase = createClient();
  const [{ data: books }, { data: progress }] = await Promise.all([
    supabase
      .from('books')
      .select('id, user_id, title, author, file_path, page_count, created_at')
      .order('created_at', { ascending: false })
      .returns<BookRow[]>(),
    supabase.from('reading_progress').select('*').returns<ReadingProgressRow[]>(),
  ]);
  const progressByBook = new Map((progress ?? []).map((p) => [p.book_id, p]));

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-white/10 bg-black/40 p-4 text-white backdrop-blur-md">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Library</h2>
        <p className="truncate text-xs text-gray-500" title={email}>
          {email}
        </p>
      </div>

      <UploadButton />

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {(books ?? []).length === 0 && <li className="text-xs text-gray-500">No books yet.</li>}
        {(books ?? []).map((b) => {
          const pct = percent(progressByBook.get(b.id), b.page_count);
          return (
            <li key={b.id}>
              <Link href={`/read/${b.id}`} className="block rounded p-2 hover:bg-white/10">
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
            </li>
          );
        })}
      </ul>

      <SignOutButton />
    </aside>
  );
}
