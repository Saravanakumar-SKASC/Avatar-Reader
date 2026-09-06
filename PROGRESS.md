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
