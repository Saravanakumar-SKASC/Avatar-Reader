-- Avatar Reader: books, reading progress, bookmarks + private storage bucket.
-- Run in the Supabase SQL editor (or `supabase db push`). Idempotent where practical.

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  title text, author text,
  file_path text, page_count int,
  created_at timestamptz default now()
);

create table if not exists reading_progress (
  user_id uuid references auth.users,
  book_id uuid references books,
  current_page int default 1,
  updated_at timestamptz default now(),
  primary key (user_id, book_id)
);

create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  book_id uuid references books,
  page int, note text,
  created_at timestamptz default now()
);

-- Row Level Security: every row is visible/writable only to its owner.
alter table books enable row level security;
alter table reading_progress enable row level security;
alter table bookmarks enable row level security;

drop policy if exists "books: owner" on books;
create policy "books: owner" on books
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reading_progress: owner" on reading_progress;
create policy "reading_progress: owner" on reading_progress
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bookmarks: owner" on bookmarks;
create policy "bookmarks: owner" on bookmarks
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket for uploaded PDFs + extracted page text. Objects live under <user_id>/...
insert into storage.buckets (id, name, public)
  values ('books', 'books', false)
  on conflict (id) do nothing;

drop policy if exists "books bucket: owner folder" on storage.objects;
create policy "books bucket: owner folder" on storage.objects
  for all to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
