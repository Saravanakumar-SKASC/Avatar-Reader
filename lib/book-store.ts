import type { StoredBook } from '@/types/book';

// Temporary client-side persistence for extracted books (localStorage).
// Replaced by Supabase in a later phase.

const KEY_PREFIX = 'avatar-reader:book:';

export function saveBook(name: string, pages: string[]): StoredBook {
  const book: StoredBook = {
    id: crypto.randomUUID(),
    name,
    pages,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(KEY_PREFIX + book.id, JSON.stringify(book));
  return book;
}

export function loadBook(id: string): StoredBook | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + id);
    return raw ? (JSON.parse(raw) as StoredBook) : null;
  } catch {
    return null;
  }
}
