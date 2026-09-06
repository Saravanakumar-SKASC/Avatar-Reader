'use client';

import { createClient } from '@/lib/supabase/client';
import type { BookRow, ReadingProgressRow } from '@/types/database';
import type { LoadedBook } from '@/types/book';
import type { BookStore } from './types';

const BUCKET = 'books';

export const supabaseStore: BookStore = {
  /** Insert a `books` row, upload the PDF + extracted page text under <user_id>/<book_id>.*, return the row. */
  async createBook(file, pages) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');

    const { data: row, error } = await supabase
      .from('books')
      .insert({ user_id: user.id, title: file.name.replace(/\.pdf$/i, ''), page_count: pages.length })
      .select()
      .single<BookRow>();
    if (error || !row) throw new Error(error?.message ?? 'Could not create book');

    const base = `${user.id}/${row.id}`;
    const [pdfRes, pagesRes] = await Promise.all([
      supabase.storage.from(BUCKET).upload(`${base}.pdf`, file, { contentType: 'application/pdf' }),
      supabase.storage
        .from(BUCKET)
        .upload(`${base}.pages.json`, new Blob([JSON.stringify(pages)], { type: 'application/json' })),
    ]);
    if (pdfRes.error) throw new Error(`PDF upload failed: ${pdfRes.error.message}`);
    if (pagesRes.error) throw new Error(`Page text upload failed: ${pagesRes.error.message}`);

    const { data: updated } = await supabase
      .from('books')
      .update({ file_path: `${base}.pdf` })
      .eq('id', row.id)
      .select()
      .single<BookRow>();
    return updated ?? { ...row, file_path: `${base}.pdf` };
  },

  /** Load a book row + its page text. Returns null if it doesn't exist / isn't the user's (RLS). */
  async loadBook(id) {
    const supabase = createClient();
    const { data: row } = await supabase.from('books').select('*').eq('id', id).maybeSingle<BookRow>();
    if (!row) return null;

    const pagesPath = (row.file_path ?? `${row.user_id}/${row.id}.pdf`).replace(/\.pdf$/, '.pages.json');
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(pagesPath);
    if (error || !blob) throw new Error(`Could not load page text: ${error?.message ?? 'missing'}`);
    const pages = JSON.parse(await blob.text()) as string[];
    const book: LoadedBook = { ...row, pages };
    return book;
  },

  async loadProgress(bookId) {
    const supabase = createClient();
    const { data } = await supabase
      .from('reading_progress')
      .select('current_page')
      .eq('book_id', bookId)
      .maybeSingle<Pick<ReadingProgressRow, 'current_page'>>();
    return data ? Math.max(0, data.current_page - 1) : 0;
  },

  async saveProgress(bookId, pageIndex) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('reading_progress').upsert(
      { user_id: user.id, book_id: bookId, current_page: pageIndex + 1, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,book_id' }
    );
  },
};
