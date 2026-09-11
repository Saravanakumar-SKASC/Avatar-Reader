'use client';

import type { BookRow, BookmarkRow } from '@/types/database';
import type { LoadedBook } from '@/types/book';
import type { BookStore, HistoryEntry } from './types';
import { looksLikeFilename, prettifyTitle } from '@/lib/title';

// localStorage layout:
//   avatar-reader:books            -> BookRow[]            (library index, newest first)
//   avatar-reader:book:<id>        -> string[]             (page text)
//   avatar-reader:progress:<id>    -> number               (1-based page, like the DB)
//   avatar-reader:history          -> Record<bookId, ISO>  (last opened)
//   avatar-reader:bookmarks        -> BookmarkRow[]
const INDEX_KEY = 'avatar-reader:books';
const HISTORY_KEY = 'avatar-reader:history';
const BOOKMARKS_KEY = 'avatar-reader:bookmarks';
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
  const books = read<BookRow[]>(INDEX_KEY, []);
  // One-time cleanup: books saved before titles were prettified still read like filenames.
  let changed = false;
  for (const b of books) {
    if (b.title && looksLikeFilename(b.title)) {
      b.title = prettifyTitle(b.title);
      changed = true;
    }
  }
  if (changed) {
    try {
      write(INDEX_KEY, books);
    } catch {}
  }
  return books;
}

export function localProgressPercent(book: BookRow): number {
  const page = read<number>(progressKey(book.id), 1);
  return book.page_count ? Math.min(100, Math.round((page / book.page_count) * 100)) : 0;
}

export function deleteLocalBook(id: string) {
  write(INDEX_KEY, listLocalBooks().filter((b) => b.id !== id));
  localStorage.removeItem(pagesKey(id));
  localStorage.removeItem(progressKey(id));
  const hist = read<Record<string, string>>(HISTORY_KEY, {});
  delete hist[id];
  write(HISTORY_KEY, hist);
  write(BOOKMARKS_KEY, read<BookmarkRow[]>(BOOKMARKS_KEY, []).filter((b) => b.book_id !== id));
  notify();
}

export const localStore: BookStore = {
  async createBook(file, pages) {
    const row: BookRow = {
      id: crypto.randomUUID(),
      user_id: 'local',
      title: prettifyTitle(file.name),
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

  async listBooks() {
    return listLocalBooks();
  },

  async updateBook(id, patch) {
    const books = listLocalBooks();
    const row = books.find((b) => b.id === id);
    if (!row) return;
    Object.assign(row, patch);
    write(INDEX_KEY, books);
    notify();
  },

  async deleteBook(id) {
    deleteLocalBook(id);
  },

  async loadProgress(bookId) {
    return Math.max(0, read<number>(progressKey(bookId), 1) - 1);
  },

  async saveProgress(bookId, pageIndex, pageCount) {
    write(progressKey(bookId), pageIndex + 1);
    const books = listLocalBooks();
    const row = books.find((b) => b.id === bookId);
    if (row && row.page_count !== pageCount) {
      row.page_count = pageCount;
      write(INDEX_KEY, books);
    }
    notify();
  },

  async touchHistory(bookId) {
    const hist = read<Record<string, string>>(HISTORY_KEY, {});
    hist[bookId] = new Date().toISOString();
    write(HISTORY_KEY, hist);
    notify();
  },

  async listHistory() {
    const hist = read<Record<string, string>>(HISTORY_KEY, {});
    const books = listLocalBooks();
    const out: HistoryEntry[] = [];
    for (const book of books) {
      const openedAt = hist[book.id];
      if (!openedAt) continue;
      out.push({ book, openedAt, percent: localProgressPercent(book), page: read<number>(progressKey(book.id), 1) });
    }
    return out.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  },

  async listBookmarks(bookId) {
    const all = read<BookmarkRow[]>(BOOKMARKS_KEY, []);
    return (bookId ? all.filter((b) => b.book_id === bookId) : all).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addBookmark(bookId, page, note) {
    const row: BookmarkRow = {
      id: crypto.randomUUID(),
      user_id: 'local',
      book_id: bookId,
      page,
      note: note ?? null,
      created_at: new Date().toISOString(),
    };
    write(BOOKMARKS_KEY, [row, ...read<BookmarkRow[]>(BOOKMARKS_KEY, [])]);
    notify();
    return row;
  },

  async removeBookmark(id) {
    write(BOOKMARKS_KEY, read<BookmarkRow[]>(BOOKMARKS_KEY, []).filter((b) => b.id !== id));
    notify();
  },
};
