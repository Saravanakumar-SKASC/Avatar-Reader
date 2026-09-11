import type { BookRow, BookmarkRow } from '@/types/database';
import type { LoadedBook } from '@/types/book';

export interface HistoryEntry {
  book: BookRow;
  /** ISO timestamp of the last time the book was opened. */
  openedAt: string;
  /** 0..100 */
  percent: number;
  /** 1-based page last read. */
  page: number;
}

export interface BookStore {
  createBook(file: File, pages: string[]): Promise<BookRow>;
  loadBook(id: string): Promise<LoadedBook | null>;
  listBooks(): Promise<BookRow[]>;
  updateBook(id: string, patch: Partial<Pick<BookRow, 'title' | 'author'>>): Promise<void>;
  deleteBook(id: string): Promise<void>;
  /** 0-based index of the page the user was last on. */
  loadProgress(bookId: string): Promise<number>;
  /** `pageCount` is the re-flowed book page count, so progress % stays accurate. */
  saveProgress(bookId: string, pageIndex: number, pageCount: number): Promise<void>;
  /** Records that a book was opened (for History). */
  touchHistory(bookId: string): Promise<void>;
  listHistory(): Promise<HistoryEntry[]>;
  listBookmarks(bookId?: string): Promise<BookmarkRow[]>;
  addBookmark(bookId: string, page: number, note?: string): Promise<BookmarkRow>;
  removeBookmark(id: string): Promise<void>;
}
