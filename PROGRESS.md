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

## 2026-09-06 — Phase 3: Server-side TTS + viseme timing (one hardcoded voice)

**What was built**
- `lib/tts/fish.ts` — `synthesizeWithFish(text, referenceId)`: POST to
  `https://api.fish.audio/v1/tts` (model header `s2.1-pro-free`, `format: 'wav'`).
  Throws if `FISH_AUDIO_API_KEY` is unset or the response is non-2xx. `reference_id` is
  omitted from the body when empty so Fish uses its default voice until real ids are filled in.
- `lib/tts/piper.ts` — `synthesizeWithPiper(text, voice)`: spawns
  `piper --model <PIPER_VOICES_DIR>/<voice>.onnx --output_file <tmp>.wav` with the text on
  stdin, reads and deletes the WAV. Env: `PIPER_PATH` (default `piper`),
  `PIPER_VOICES_DIR` (default `~/piper-voices`).
- `lib/tts/rhubarb.ts` — `extractVisemes(buffer)`: writes a temp WAV, runs
  `rhubarb <wav> -f json -o <json>` via `execFile`, returns `mouthCues`, cleans up.
  Env: `RHUBARB_PATH` (default `rhubarb`). Temp files go to `os.tmpdir()`.
- `app/api/speak/route.ts` — POST `{ text }`. Tries Fish; on any throw, logs a warning and
  falls back to Piper; then runs Rhubarb on whichever WAV resulted. Returns
  `{ audioBase64, visemes, engineUsed: 'fish' | 'piper' }`. Errors: 400 bad body,
  502 `{ error, fish, piper }` if both engines fail, 500 `{ error, engineUsed }` if Rhubarb fails.
  Voice is hardcoded in the route (`fishReferenceId: ''`, `piperVoice: 'en_US-ryan-high'`).
- `types/tts.ts` — `Viseme`, `TtsEngine`, `SpeakResponse`.
- Reader page — "▶ Play page" button posts the current page's text to `/api/speak`, plays the
  WAV via a data-URL `Audio`, shows which engine was used, and surfaces errors inline.
  Visemes are returned but not consumed yet (avatar phase).
- `.env.local.example` — documented optional `RHUBARB_PATH`, `PIPER_PATH`, `PIPER_VOICES_DIR`.
  `SETUP.md` updated to say those env vars are now live.
- Not done (deferred per phase scoping): Supabase Storage caching of audio+visemes (CLAUDE.md
  rule 2) — every click currently re-synthesizes. Must land before the caching rule is honoured.

**Verified**
- `npm run build` zero errors; `npm test` 1 passing.
- Live: `POST /api/speak` with a real key reached Rhubarb with `engineUsed: "fish"`, i.e. the
  Fish call succeeds with the default voice. Rhubarb/Piper are not installed on this machine,
  so the viseme step and the Piper fallback were not exercised end-to-end.

**Files changed**
- `lib/tts/fish.ts`, `lib/tts/piper.ts`, `lib/tts/rhubarb.ts`, `app/api/speak/route.ts`,
  `types/tts.ts` (new)
- `app/(reader)/read/[bookId]/page.tsx` (Play page button)
- `.env.local.example`, `SETUP.md`
- Removed `lib/tts/.gitkeep`

**How to verify**
- Install `rhubarb` and `piper` + the `en_US-ryan-high` voice per SETUP.md; put
  `FISH_AUDIO_API_KEY` in `.env.local`.
- `npm run dev`, upload a PDF, click "▶ Play page" → audio plays, label shows "Fish Audio".
- Remove/blank `FISH_AUDIO_API_KEY`, restart dev, click again → label shows
  "Piper (local fallback)" and audio still plays.
- CLI: `curl -s -X POST localhost:3000/api/speak -H 'Content-Type: application/json'
  -d '{"text":"Hello"}' | jq '{engineUsed, n: (.visemes|length)}'` → non-zero viseme count.

## 2026-09-06 — Phase 3 follow-up: Rhubarb installed, Fish WAV header fix

**What changed**
- Installed Rhubarb Lip Sync 1.14.0 (x86_64 build, runs under Rosetta) at
  `~/bin/rhubarb/rhubarb`; `.env.local` sets `RHUBARB_PATH=~/bin/rhubarb/rhubarb`.
- Fish Audio returns a *streaming* WAV: RIFF size and `data` chunk size are `0xFFFFFFFF`
  placeholders. Rhubarb refuses such files ("Could not open sound file"). Added
  `lib/tts/wav.ts` → `fixWavHeader(buffer)` which rewrites both sizes from the real length
  (no-op for well-formed WAVs, e.g. Piper output; passes non-WAV data through).
  `extractVisemes` now writes the fixed buffer to disk before invoking Rhubarb.
- `tests/wav.test.ts` — 3 unit tests for `fixWavHeader`.

**Verified**
- `POST /api/speak` on the dev server → `engineUsed: "fish"`, 18 visemes, no error.
- `npm test` → 4 passing.
- Piper is still not installed, so the fallback path remains unexercised.

**Files changed**
- `lib/tts/wav.ts`, `tests/wav.test.ts` (new); `lib/tts/rhubarb.ts`; `.env.local` (local only)

## 2026-09-06 — Phase 3 follow-up: Piper installed, fallback verified

**What changed**
- The `piper_macos_aarch64.tar.gz` GitHub release is unusable on macOS (Intel binary,
  missing `libespeak-ng` / `libpiper_phonemize` / `libonnxruntime` dylibs). Installed the
  `piper-tts` Python package into `~/bin/piper-venv` instead; its `piper` CLI accepts the
  same `--model` / `--output_file` flags and reads text from stdin, so `lib/tts/piper.ts`
  needed no changes. `.env.local` sets `PIPER_PATH=~/bin/piper-venv/bin/piper`.
- Downloaded `en_US-ryan-high.onnx` + `.onnx.json` into `~/piper-voices/`.
- `SETUP.md` Piper section rewritten: macOS uses the pip route; Linux/Windows keep the
  tarball route; voice-download example added.

**Verified**
- Direct: `piper` → 22 kHz WAV → `rhubarb` → 24 cues.
- Through the app with Fish returning 401: `POST /api/speak` → `engineUsed: "piper"`,
  17 visemes, ~4.6 s for one sentence (Rhubarb dominates). Fallback path is live (rule 6).
- Fish key on disk now returns 401 from the API — key was revoked/rotated on the Fish side;
  needs a fresh key pasted into `.env.local`.

**Files changed**
- `SETUP.md`; `.env.local` (local only). No source changes.

## 2026-09-06 — Phase 4: Selectable 3D avatars, idle + blink (no lip-sync)

**What was built**
- `types/avatar.ts` + `lib/avatars.ts` — `AVATARS` registry (7 entries from CLAUDE.md:
  id, name, personality, `fishReferenceId` (empty placeholders), `emotionTag`, `piperVoice`,
  optional `piperSpeaker`, `vrmUrl` `/avatars/<id>.vrm`, `thumbnailUrl` `/avatars/<id>.png`,
  accent `color`). `DEFAULT_AVATAR_ID`, `getAvatar(id)`.
- `components/avatar/useBlink.ts` — render-loop blink driver (`useFrame`). Random 2–6 s
  interval, 200 ms sine close/open. A blink is a single state machine per hook instance:
  the next blink is scheduled only after the current one reaches weight 0, so overlapping
  blinks cannot occur. Each avatar instance gets independent timing.
- `components/avatar/AvatarCanvas.tsx` — R3F `<Canvas>`. `AvatarModel` HEAD-checks the
  `.vrm` URL; if present, loads it with `GLTFLoader` + `VRMLoaderPlugin`, applies
  `VRMUtils.rotateVRM0`, drives `expressionManager.setValue('blink', w)` and `vrm.update`.
  If missing (404) or failing to parse, renders a placeholder (box body, sphere head, two
  eye spheres that squash on blink, `Html` name label). Both variants share a subtle idle
  bob/sway. Models are disposed on swap/unmount; `key={avatar.id}` forces clean remounts.
- `components/avatar/AvatarPicker.tsx` — horizontal-scroll carousel of 7 cards:
  thumbnail (`<id>.png`, falls back to an initial badge), name, personality, emerald border
  on the selected card, `aria-pressed`.
- Reader page — avatar canvas (320×420) beside the book, picker below the controls.
  Selection swaps the loaded model and is remembered in `localStorage`
  (`avatar-reader:avatar`). `AvatarCanvas` is loaded via `next/dynamic` `ssr: false`.
- `public/avatars/README.md` — where to drop `<id>.vrm` / `<id>.png`.
- No `.vrm` files ship yet; all seven avatars currently render as placeholders.
- No lip-sync; visemes from `/api/speak` are still unused. Voice selection is not yet
  wired to the picker (Phase 5 registry work).

**Verified**
- `npm run build` (on an isolated copy, to avoid clobbering the running dev server's
  `.next`) → zero errors. `npx tsc --noEmit` + `next lint` clean. `npm test` → 4 passing.
- Dev server: `/read/<id>` 200; `/avatars/alex.vrm` HEAD 404 → placeholder path.
- Not verified: WebGL rendering in a real browser (no browser automation here).

**Files changed**
- `types/avatar.ts`, `lib/avatars.ts`, `components/avatar/useBlink.ts`,
  `components/avatar/AvatarCanvas.tsx`, `components/avatar/AvatarPicker.tsx`,
  `public/avatars/README.md` (new)
- `app/(reader)/read/[bookId]/page.tsx`
- Removed `components/avatar/.gitkeep`

**How to verify**
- Open a book at `/read/<id>`: a placeholder figure idles (gentle bob/sway) left of the
  book and blinks at random every 2–6 s. Watch for ~20 s: no double-blinks or stuck eyes.
- The picker shows 7 cards; scroll horizontally. Click a card → border highlights, the
  figure's body colour and label change. Reload → selection persists.
- Drop any VRM at `public/avatars/alex.vrm`, reload → the real model renders and blinks
  via its `blink` expression.

## 2026-09-06 — Phase 4 follow-up: WebGL fallback

**What changed**
- `AvatarCanvas` now probes for a WebGL/WebGL2 context before mounting the R3F `<Canvas>`.
  If none is available (e.g. VS Code's Simple Browser, or Chrome with hardware
  acceleration off) it renders a static initial badge with a hint to open a real browser,
  instead of the whole reader crashing with "THREE.WebGLRenderer: Error creating WebGL
  context". A `CanvasErrorBoundary` also contains any renderer error to the avatar panel.

**Files changed**
- `components/avatar/AvatarCanvas.tsx`

## 2026-09-06 — Phase 4 follow-up: camera frames the face

**What changed**
- With a real VRM, the fixed camera (hip height, looking at the floor origin) showed only
  the legs. `AvatarCanvas` now has a `FaceCamera` component: after a VRM loads, `eyeHeight()`
  reads the humanoid `head` bone's world position (+0.06 m to reach the eyes) and the camera
  is placed at that height, 0.75 m in front, looking straight at it (30° FOV → head +
  shoulders). The placeholder uses the same component at 1.4 m / 1.4 m distance.
- Idle sway amplitude reduced so the close-up doesn't drift sideways.
- Canvas `near` plane lowered to 0.05 for the close shot.
- First real model dropped in: `public/avatars/Alex.vrm` (VRM 1.0, 54 bones, has `blink` and
  `aa/ee/ih/oh/ou` expressions — usable for lip-sync later). **Rename to lowercase
  `alex.vrm`**: macOS serves it case-insensitively, Linux will not.

**Files changed**
- `components/avatar/AvatarCanvas.tsx`
