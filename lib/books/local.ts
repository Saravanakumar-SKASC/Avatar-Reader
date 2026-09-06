'use client';

import type { BookRow } from '@/types/database';
import type { LoadedBook } from '@/types/book';
import type { BookStore } from './types';

// localStorage layout:
//   avatar-reader:books            -> BookRow[]            (library index, newest first)
//   avatar-reader:book:<id>        -> string[]             (page text)
//   avatar-reader:progress:<id>    -> number               (1-based page, like the DB)
const INDEX_KEY = 'avatar-reader:books';
const pagesKey = (id: string) => `avatar-reader:book:${id}`;
const progressKey = (id: string) => `avatar-reader:progress:${id}`;

/** Fired on window whenever the local library changes, so the sidebar can refresh. */
export const LOCAL_BOOKS_EVENT = 'avatar-reader:books-changed';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
function notify() {
  window.dispatchEvent(new Event(LOCAL_BOOKS_EVENT));
}

export function listLocalBooks(): BookRow[] {
  return read<BookRow[]>(INDEX_KEY, []);
}

export function localProgressPercent(book: BookRow): number {
  const page = read<number>(progressKey(book.id), 1);
  return book.page_count ? Math.min(100, Math.round((page / book.page_count) * 100)) : 0;
}

export function deleteLocalBook(id: string) {
  write(INDEX_KEY, listLocalBooks().filter((b) => b.id !== id));
  localStorage.removeItem(pagesKey(id));
  localStorage.removeItem(progressKey(id));
  notify();
}

export const localStore: BookStore = {
  async createBook(file, pages) {
    const row: BookRow = {
      id: crypto.randomUUID(),
      user_id: 'local',
      title: file.name.replace(/\.pdf$/i, ''),
      author: null,
      file_path: null, // the PDF itself isn't kept; only its extracted text
      page_count: pages.length,
      created_at: new Date().toISOString(),
    };
    try {
      write(pagesKey(row.id), pages);
      write(INDEX_KEY, [row, ...listLocalBooks()]);
    } catch (err) {
      throw new Error(
        `Could not save book locally (browser storage full?): ${err instanceof Error ? err.message : err}`
      );
    }
    notify();
    return row;
  },

  async loadBook(id) {
    const row = listLocalBooks().find((b) => b.id === id);
    if (!row) return null;
    const pages = read<string[] | null>(pagesKey(id), null);
    if (!pages) return null;
    const book: LoadedBook = { ...row, pages };
    return book;
  },

  async loadProgress(bookId) {
    return Math.max(0, read<number>(progressKey(bookId), 1) - 1);
  },

  async saveProgress(bookId, pageIndex) {
    write(progressKey(bookId), pageIndex + 1);
    notify();
  },
};
