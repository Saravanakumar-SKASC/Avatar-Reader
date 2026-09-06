import type { BookRow } from './database';

/** A book row plus its extracted page text (stored as JSON in the `books` bucket). */
export interface LoadedBook extends BookRow {
  pages: string[];
}
