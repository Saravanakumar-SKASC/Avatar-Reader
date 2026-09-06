# Progress Log

## 2026-09-05 — Phase 0: Project setup

**What was built**
- Scaffolded Next.js 14.2 (App Router) with TypeScript strict mode, Tailwind CSS, ESLint.
- Installed runtime deps: `pdfjs-dist`, `react-pageflip`, `three`, `@react-three/fiber@8`,
  `@react-three/drei@9`, `@pixiv/three-vrm`, `@supabase/supabase-js`. Dev dep: `@types/three`.
  - Note: `@react-three/fiber` v9 / `@react-three/drei` v10 require React 19; Next 14 ships
    React 18, so the v8 / v9 lines are pinned. Do not bump them without moving to Next 15.
- Created empty folders (with `.gitkeep`): `app/api/`, `app/(reader)/`, `components/book/`,
  `components/avatar/`, `lib/tts/`, `lib/supabase/`, `types/`.
- Created `.env.local.example` with placeholders for `FISH_AUDIO_API_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Created `SETUP.md` with install instructions for the `rhubarb` and `piper` binaries
  (not installed yet).
- No features, no API routes, no TTS code.

**Files changed**
- `package.json`, `package-lock.json`, `tsconfig.json`, `tailwind.config.ts`,
  `postcss.config.mjs`, `next.config.mjs`, `.eslintrc.json`, `.gitignore`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` (create-next-app defaults)
- `.env.local.example`, `SETUP.md`, `PROGRESS.md`
- Folder placeholders listed above

**How to verify**
- `npm run build` completes with zero TypeScript/lint errors.
- `npm run dev` serves the default Next.js page at http://localhost:3000.
- `ls app/api "app/(reader)" components/book components/avatar lib/tts lib/supabase types` shows the folders.

## 2026-09-05 — Phase 1: PDF upload and text extraction

**What was built**
- `app/api/extract/route.ts` — POST handler that takes a multipart `file` field, parses it
  with `pdfjs-dist/legacy/build/pdf.mjs` (Node runtime), and returns
  `{ pageCount, pages: string[] }` with one text string per page. Returns 400 if no file.
- `app/(reader)/upload/page.tsx` — client page at `/upload` with a file input + submit
  button; posts to `/api/extract` and renders the page count and per-page text.
- `next.config.mjs` — added `experimental.serverComponentsExternalPackages: ['pdfjs-dist']`
  so Next leaves pdfjs unbundled on the server (its worker is loaded via dynamic import).
- Vitest added (`npm test` → `vitest run`). `tests/extract.test.ts` calls the route handler
  with `tests/fixtures/sample.pdf` (a hand-built 2-page PDF) and asserts `pageCount > 0`,
  one string per page, and that page 1 contains its known text.
- No storage, no Supabase, no TTS.

**Files changed**
- `app/api/extract/route.ts` (new), `app/(reader)/upload/page.tsx` (new)
- `tests/extract.test.ts`, `tests/fixtures/sample.pdf`, `vitest.config.mts` (new)
- `next.config.mjs`, `package.json`, `package-lock.json` (vitest dev dep, `test` script)
- Removed `app/api/.gitkeep` and `app/(reader)/.gitkeep` (folders now have real content)

**How to verify**
- `npm test` → 1 test passes.
- `npm run build` → zero errors; route table shows `ƒ /api/extract` and `○ /upload`.
- `npm run dev`, open http://localhost:3000/upload, pick any PDF, click "Extract text";
  page count and per-page text appear below the form.
- CLI: `curl -X POST -F "file=@tests/fixtures/sample.pdf" http://localhost:3000/api/extract`
  returns `{"pageCount":2,"pages":["Hello from page one","Hello from page two"]}`.

## 2026-09-06 — Phase 2: Book-flip reading UI (no audio)

**What was built**
- `components/book/BookViewer.tsx` — client component wrapping `react-pageflip`
  (`HTMLFlipBook`, 480×640, `showCover`). Takes `pages`, `currentPage`, and an optional
  `onFlip` callback so drag/click flips report back to the parent. A `useEffect` calls
  `pageFlip().flip(currentPage)` when the prop changes (skipped if already on that page).
  - `react-pageflip`'s `IFlipSetting` declares every setting as required, so all settings
    are passed explicitly (page-flip defaults). `page-flip` ships no typings; a minimal
    `PageFlipApi` interface types the ref instead of `any`.
- `app/(reader)/read/[bookId]/page.tsx` — client page at `/read/<bookId>`. Loads the book,
  renders `BookViewer` via `next/dynamic` with `ssr: false` (react-pageflip touches
  `window`), and provides Prev/Next buttons, a "Page X of N" counter, and ←/→ keyboard
  navigation. Shows "Book not found" with a link to `/upload` for unknown ids.
- `lib/book-store.ts` + `types/book.ts` — `saveBook(name, pages)` / `loadBook(id)` backed
  by `localStorage` (key `avatar-reader:book:<uuid>`). Temporary until Supabase lands;
  books exist only in the browser that uploaded them.
- `app/(reader)/upload/page.tsx` — on successful extraction it now saves the book and
  navigates to `/read/<bookId>` instead of rendering the raw text inline.
- No audio, no avatar, no Supabase.

**Known limitation**
- Page text is not re-flowed to fit the 480×640 page; long PDF pages are clipped
  (`overflow-hidden`). Pagination/re-flow is deferred.

**Files changed**
- `components/book/BookViewer.tsx`, `app/(reader)/read/[bookId]/page.tsx`,
  `lib/book-store.ts`, `types/book.ts` (new)
- `app/(reader)/upload/page.tsx` (save + redirect)
- Removed `components/book/.gitkeep`, `types/.gitkeep`

**How to verify**
- `npm run build` → zero errors; route table shows `ƒ /read/[bookId]`.
- `npm test` → still 1 passing.
- `npm run dev`, open http://localhost:3000/upload, choose a PDF, click "Open as book".
  You land on `/read/<uuid>` with a flip-book: drag a page corner or click a page edge to
  flip; Prev/Next buttons and arrow keys move pages; the counter stays in sync with drags.
- Open `/read/does-not-exist` → "Book not found" with an upload link.
