'use client';

import { createClient } from '@/lib/supabase/client';
import type { BookRow, BookmarkRow, ReadingProgressRow } from '@/types/database';
import type { LoadedBook } from '@/types/book';
import type { BookStore, HistoryEntry } from './types';
import { prettifyTitle } from '@/lib/title';

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
      .insert({ user_id: user.id, title: prettifyTitle(file.name), page_count: pages.length })
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

  async listBooks() {
    const supabase = createClient();
    const { data } = await supabase.from('books').select('*').order('created_at', { ascending: false }).returns<BookRow[]>();
    return data ?? [];
  },

  async updateBook(id, patch) {
    const supabase = createClient();
    await supabase.from('books').update(patch).eq('id', id);
  },

  async deleteBook(id) {
    const supabase = createClient();
    await supabase.from('bookmarks').delete().eq('book_id', id);
    await supabase.from('reading_progress').delete().eq('book_id', id);
    await supabase.from('books').delete().eq('id', id);
  },

  async touchHistory(bookId) {
    // reading_progress.updated_at doubles as "last opened"; ensure a row exists.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('reading_progress').select('current_page').eq('book_id', bookId).maybeSingle<{ current_page: number }>();
    await supabase.from('reading_progress').upsert(
      { user_id: user.id, book_id: bookId, current_page: data?.current_page ?? 1, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,book_id' }
    );
  },

  async listHistory() {
    const supabase = createClient();
    const [{ data: books }, { data: progress }] = await Promise.all([
      supabase.from('books').select('*').returns<BookRow[]>(),
      supabase.from('reading_progress').select('*').order('updated_at', { ascending: false }).returns<ReadingProgressRow[]>(),
    ]);
    const byId = new Map((books ?? []).map((b) => [b.id, b]));
    const out: HistoryEntry[] = [];
    for (const p of progress ?? []) {
      const book = byId.get(p.book_id);
      if (!book) continue;
      const percent = book.page_count ? Math.min(100, Math.round((p.current_page / book.page_count) * 100)) : 0;
      out.push({ book, openedAt: p.updated_at, percent, page: p.current_page });
    }
    return out;
  },

  async listBookmarks(bookId) {
    const supabase = createClient();
    let q = supabase.from('bookmarks').select('*').order('created_at', { ascending: false });
    if (bookId) q = q.eq('book_id', bookId);
    const { data } = await q.returns<BookmarkRow[]>();
    return data ?? [];
  },

  async addBookmark(bookId, page, note) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('bookmarks')
      .insert({ user_id: user.id, book_id: bookId, page, note: note ?? null })
      .select()
      .single<BookmarkRow>();
    if (error || !data) throw new Error(error?.message ?? 'Could not add bookmark');
    return data;
  },

  async removeBookmark(id) {
    const supabase = createClient();
    await supabase.from('bookmarks').delete().eq('id', id);
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

  async saveProgress(bookId, pageIndex, pageCount) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await Promise.all([
      supabase.from('reading_progress').upsert(
        { user_id: user.id, book_id: bookId, current_page: pageIndex + 1, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,book_id' }
      ),
      supabase.from('books').update({ page_count: pageCount }).eq('id', bookId),
    ]);
  },
};
