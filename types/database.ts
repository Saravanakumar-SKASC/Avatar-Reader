export interface BookRow {
  id: string;
  user_id: string;
  title: string | null;
  author: string | null;
  file_path: string | null;
  page_count: number | null;
  created_at: string;
}

export interface ReadingProgressRow {
  user_id: string;
  book_id: string;
  /** 1-based page number (DB convention). UI page indices are 0-based. */
  current_page: number;
  updated_at: string;
}

export interface BookmarkRow {
  id: string;
  user_id: string;
  book_id: string;
  page: number | null;
  note: string | null;
  created_at: string;
}
