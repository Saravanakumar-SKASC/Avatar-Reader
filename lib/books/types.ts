import type { BookRow } from '@/types/database';
import type { LoadedBook } from '@/types/book';

export interface BookStore {
  createBook(file: File, pages: string[]): Promise<BookRow>;
  loadBook(id: string): Promise<LoadedBook | null>;
  /** 0-based index of the page the user was last on. */
  loadProgress(bookId: string): Promise<number>;
  saveProgress(bookId: string, pageIndex: number): Promise<void>;
}
