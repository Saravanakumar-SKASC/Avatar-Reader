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

## 2026-09-06 — Phase 5: Per-avatar Fish voice + emotion tag, voice override

**What was built**
- `app/api/speak/route.ts` — body is now `{ text, avatarId?, voiceOverride? }`
  (`types/tts.ts` → `SpeakRequest`). Looks the avatar up in `lib/avatars.ts`
  (400 on unknown id; defaults to `alex` if omitted). Fish gets
  `reference_id = voiceOverride || avatar.fishReferenceId` and the literal text with the
  avatar's inline tag prepended, e.g. `"[excited] Once upon a time"` — no SSML. Piper
  fallback ignores the tag and uses `avatar.piperVoice` (+ `--speaker N` when
  `piperSpeaker` is set, e.g. Zara on `en_US-libritts_r-medium`). Response now also carries
  `avatarId`, `fishReferenceId` and `emotionTag` actually used.
- `lib/avatars.ts` — `withEmotionTag(tag, text)`, `fishVoiceOptions()` (distinct non-empty
  reference_ids from the registry, for the dropdown).
- `lib/tts/piper.ts` — optional `speaker` arg; checks the `.onnx` exists first and throws a
  clear "voice model not found: <path>" instead of an opaque Piper exit code.
- `components/avatar/VoiceOverride.tsx` — "Voice" dropdown: *Avatar default*, one entry per
  registry voice, and *Custom reference_id…* which reveals a text input. Persisted in
  `localStorage` (`avatar-reader:voice-override`). Since all registry reference_ids are still
  `''`, the list currently shows only *Avatar default* + *Custom* — it fills in as ids are added.
- Reader page — Play sends `avatarId` (the picker selection) and `voiceOverride`; the
  status line shows avatar · engine · voice · tag. Switching avatars now changes model,
  voice and emotion delivery together.
- Piper voice models downloaded for every avatar into `~/piper-voices/`
  (amy, alan, lessac, libritts_r, joe; ~330 MB total) so the fallback works for all 7.
- `tests/avatars.test.ts` — `withEmotionTag` + registry sanity (3 tests).

**Verified (live dev server, fresh Fish key)**
- `luna` → `engineUsed: fish`, `emotionTag: "[calm]"`, 12 visemes.
- `zara` + bogus `voiceOverride` → Fish 4xx → `engineUsed: piper` on libritts_r speaker 0,
  9 visemes (fallback path incl. multi-speaker flag).
- unknown `avatarId` → 400. `npm run build` (isolated copy) clean; `npm test` 7 passing.
- Not verified by ear: whether Fish honours `[calm]` / `[cheerful]` / `[friendly]`.
  CLAUDE.md lists them as untested — if a tag is spoken aloud or has no effect, blank it
  in the registry.

**Still open**
- All 7 `fishReferenceId` values are placeholders (`''` → Fish default voice). Fill them
  from fish.audio/voice-library; the override dropdown is the quick way to audition ids.
- Supabase caching (rule 2) still not implemented — each Play re-synthesizes.

**Files changed**
- `app/api/speak/route.ts`, `lib/avatars.ts`, `lib/tts/piper.ts`, `types/tts.ts`,
  `app/(reader)/read/[bookId]/page.tsx`
- `components/avatar/VoiceOverride.tsx`, `tests/avatars.test.ts` (new)

## 2026-09-06 — Phase 6: Lip-sync from Rhubarb visemes

**What was built**
- `components/avatar/lipsync.ts` — `RHUBARB_TO_VRM` (X/A→neutral, B/G→ih, C→ee, D/H→aa,
  E→oh, F→ou), `VRM_MOUTH_SHAPES`, `activeShapeAt(visemes, t)` (Rhubarb cues are
  `[start, end)` ranges in seconds), `MOUTH_OPENNESS` per shape for the placeholder.
- `components/avatar/useLipSync.ts` — generic `useFrame` driver: reads the playing
  `<audio>`'s `currentTime`, picks the active shape, eases each of the 5 vowel weights toward
  1/0 (`delta * 12` smoothing), and hands `(shape, weight)` to an `apply` callback. Reads
  `currentTime` only while the element is playing; after `ended` it treats time as ∞ so the
  mouth relaxes; with no element/cues it stays neutral.
- `AvatarCanvas` — takes `visemes` + `audioRef`. `VrmModel` applies weights via
  `expressionManager.setValue(shape, w)`, registered *before* the `vrm.update(delta)` frame
  (three-vrm applies expression weights inside `update`). The placeholder gained a box mouth
  whose height blends `MOUTH_OPENNESS` across the smoothed weights, so lip-sync is visible
  even before a `.vrm` exists. Works for whichever avatar is loaded — nothing hardcoded.
- Blinking stays on the existing `useBlink` (render-loop, overlap-proof) rather than the
  `setTimeout` blink in the reference loop, per the Phase 4 guard requirement.
- Reader page — stores the `visemes` from `/api/speak`, assigns `audioRef.current` before
  publishing the cues so the loop always reads the right element's clock, and passes both to
  `AvatarCanvas`. Cues are cleared when a new Play starts.
- `tests/lipsync.test.ts` — range boundaries (inclusive start / exclusive end), neutral
  outside cues and for unknown letters, every Rhubarb letter maps to a valid shape.

**Verified**
- `npm run build` (isolated copy) clean; `next lint` clean; `npm test` → 10 passing;
  `/read/<id>` 200 on the dev server.
- Not verified visually (no browser automation): mouth motion in sync with audio.

**Files changed**
- `components/avatar/lipsync.ts`, `components/avatar/useLipSync.ts`, `tests/lipsync.test.ts` (new)
- `components/avatar/AvatarCanvas.tsx`, `app/(reader)/read/[bookId]/page.tsx`

**How to verify**
- Open a book with Alex (real VRM), press Play: mouth shapes change with the speech and
  settle closed when audio ends; blinking continues independently throughout.
- Switch to any placeholder avatar and press Play: the red box mouth opens/closes in time.
- Press Play again mid-speech: old audio stops, mouth resets, new cues drive the new audio.

## 2026-09-06 — Phase 7: Supabase auth + persistence

**What was built**
- `supabase/migrations/0001_init.sql` — `books`, `reading_progress`, `bookmarks` exactly as
  specified, RLS enabled with one owner policy each (`auth.uid() = user_id` for
  using/with-check), plus a private `books` storage bucket with an owner-folder policy
  (`<user_id>/…`). Run it in the SQL editor.
- `@supabase/ssr` added. `lib/supabase/{env,client,server,middleware}.ts`: browser client,
  server (cookies) client, and `updateSession` used by root `middleware.ts` — refreshes the
  auth cookie on every request, redirects signed-out users from `/upload` and `/read/*` to
  `/login?next=…`, and signed-in users away from `/login`. Anon key only; no service role.
- Auth: `app/(auth)/login/page.tsx` (email+password sign-in / sign-up toggle, "Continue with
  Google" via `signInWithOAuth`), `app/auth/callback/route.ts` (exchanges the OAuth /
  email-confirmation `code` for a session), `components/library/SignOutButton.tsx`.
- `app/(reader)/layout.tsx` — server-side auth gate (`getUser()`), renders the Library
  sidebar beside `/upload` and `/read/*`. Shows a "Supabase is not configured" notice when
  env vars are empty instead of crashing.
- `components/library/LibrarySidebar.tsx` — server component: user's books (newest first)
  with a progress bar and reading % = `current_page / page_count`, upload link, sign-out.
- `lib/books.ts` (replaces `lib/book-store.ts` / localStorage): `createBook` inserts the
  row, uploads `<uid>/<book_id>.pdf` and `<uid>/<book_id>.pages.json` (the extracted text —
  the spec'd schema has no column for it, so it lives in Storage beside the PDF), sets
  `file_path`; `loadBook`, `loadProgress`, `saveProgress` (DB is 1-based, UI 0-based).
- Reader page — loads book + progress from Supabase, opens at the saved page, saves on
  page flip (500 ms debounce) and immediately on unmount / `pagehide`. Books saved in
  localStorage by earlier phases are no longer reachable (re-upload).
- `SETUP.md` — Supabase section: project, migration, redirect URLs, email confirmation,
  Google OAuth client setup.
- `bookmarks` table exists with RLS; no UI yet (not requested).

**Verified**
- `npm run build` (isolated copy) clean — routes: `/login` static, `/upload`, `/read/[bookId]`,
  `/auth/callback` dynamic, middleware active. `next lint` clean. `npm test` 10 passing.
- Dev server with empty Supabase env: `/upload`, `/read/x`, `/login` render the
  "not configured" notice (200) rather than erroring.
- **Not verified end-to-end**: no Supabase project exists yet (env empty), so sign-in,
  RLS, uploads, sidebar data and progress saving are untested against a real backend.

**Files changed**
- New: `supabase/migrations/0001_init.sql`, `middleware.ts`, `lib/supabase/env.ts`,
  `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`,
  `lib/books.ts`, `types/database.ts`, `app/(auth)/login/page.tsx`,
  `app/auth/callback/route.ts`, `app/(reader)/layout.tsx`,
  `components/library/LibrarySidebar.tsx`, `components/library/SignOutButton.tsx`
- Changed: `app/(reader)/upload/page.tsx`, `app/(reader)/read/[bookId]/page.tsx`,
  `types/book.ts`, `SETUP.md`, `package.json`
- Removed: `lib/book-store.ts`, `lib/supabase/.gitkeep`

**How to verify (after SETUP.md Supabase steps)**
- Visit `/upload` signed out → redirected to `/login`. Sign up with email (confirm link →
  `/auth/callback` → `/upload`), or Continue with Google.
- Upload a PDF → row in `books`, two objects in Storage `books/<uid>/`, sidebar lists it at 0%.
- Flip pages, reload → reopens on the same page; sidebar % updates. Close the tab mid-read
  and reopen → position kept.
- Second account cannot see the first account's books (RLS).

## 2026-09-06 — Phase 7 follow-up: publishable-key env name

**What changed**
- Supabase's Connect dialog now hands out `sb_publishable_…` keys, and the user saved one as
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the app only read `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  hence the "not configured" notice. `lib/supabase/env.ts` now accepts either name
  (publishable key is a drop-in for the anon JWT). `.env.local.example` and `SETUP.md` updated.

**Verified against the live project**
- REST: `books`, `reading_progress`, `bookmarks` all answer 200 → migration applied.
- Auth settings: email enabled, email confirmation ON, Google provider OFF (needs a Google
  OAuth client + enabling in the dashboard; see SETUP.md step 5).
- Dev server: `/upload` and `/read/*` now 307 → `/login?next=…`; `/login` 200.
- Not yet verified: storage bucket (hidden from unauthenticated probes), sign-up →
  callback → upload → progress flow. Needs a real sign-in.

**Files changed**
- `lib/supabase/env.ts`, `.env.local.example`, `SETUP.md`

## 2026-09-06 — Chrome extension (side-panel wrapper) + narrow-layout support

**What was built**
- `extension/` — Manifest V3 extension (Chrome 114+). Toolbar icon opens the side panel
  (`sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`); `sidepanel.html` frames
  the running app at `APP_URL` (`config.js`, default `http://localhost:3000`). Pings
  `/login` first and shows a "start the app: npm run dev" notice if unreachable. Buttons:
  ↻ reload, ⧉ open in a popup window (via `background.js`) — required for Google sign-in,
  which refuses to run in a frame. `host_permissions` for the app URL makes Chrome treat the
  framed app as first-party so Supabase auth cookies work inside the panel. Solid-colour
  PNG icons generated with a pure-python encoder. `extension/README.md` has load/deploy steps.
- App changes so it's usable in a ~400 px panel:
  - `components/library/ReaderShell.tsx` — Library sidebar is static on `lg+`, and a
    "☰ Library" slide-over below that. `app/(reader)/layout.tsx` uses it.
  - `components/book/ScaleToFit.tsx` — CSS-transform scales the fixed 960×640 two-page
    flip-book down to the container width (ResizeObserver). Reader page wraps
    `BookViewer` in it; avatar canvas is 320 px tall / full-width on narrow screens,
    side-by-side layout only from `xl`.
- Verified: `/login` sends no `X-Frame-Options` / CSP `frame-ancestors`, so framing works.
  `npm run build` (isolated) clean, `tsc` + `lint` clean, manifest JSON valid, extension
  scripts pass `node --check`. Not verified: loading the extension in Chrome (no browser here).

**Files changed**
- New: `extension/{manifest.json,config.js,background.js,sidepanel.html,sidepanel.css,sidepanel.js,README.md,icons/*}`,
  `components/library/ReaderShell.tsx`, `components/book/ScaleToFit.tsx`
- Changed: `app/(reader)/layout.tsx`, `app/(reader)/read/[bookId]/page.tsx`, `app/(reader)/upload/page.tsx`

**How to verify**
- `npm run dev`; `chrome://extensions` → Developer mode → Load unpacked → `extension/`.
  Click the icon: side panel shows the login page. Sign in with email, upload, read.
- Stop the dev server, press ↻ → "app isn't running" notice. Start it, ↻ → app returns.
- Click ⧉ → app opens in a 1280×900 popup window; Google sign-in works there.
- Drag the panel wider/narrower: the book scales; ☰ Library opens the sidebar as a slide-over.

## 2026-09-06 — Local mode (no Supabase) + demo book

**Why**
- User doesn't want to add a payment method to Google Cloud / Supabase. Local mode makes
  the app fully usable with zero accounts; the Supabase path stays in the code, unused.

**What was built**
- `NEXT_PUBLIC_LOCAL_MODE=true` (set in `.env.local`, documented in `.env.local.example`).
  `isLocalMode()` in `lib/supabase/env.ts` is true when the flag is set *or* Supabase isn't
  configured. `middleware.ts` does no auth gating in local mode and sends `/login` → `/upload`.
- `lib/books/` — one `BookStore` interface, two implementations: `local.ts` (localStorage:
  `avatar-reader:books` index, `avatar-reader:book:<id>` pages, `avatar-reader:progress:<id>`
  1-based page; fires `avatar-reader:books-changed` on writes) and `supabase.ts` (the Phase 7
  code, unchanged). `index.ts` exports whichever is active — the upload/reader pages didn't
  change their imports. Local mode keeps only extracted text, not the PDF bytes.
- `components/library/LocalLibrarySidebar.tsx` — client sidebar: books newest first with
  reading %, live-updates via the change event (and `storage` for other tabs), hover ×
  to remove a book. `app/(reader)/layout.tsx` picks it in local mode; no `getUser()` call.
- `/login` in local mode shows a "no account needed" note (middleware normally redirects
  before it renders).
- Demo: `public/demo/lighthouse.pdf` — a 4-page original short story generated with a
  pure-python PDF writer (Times, headings, page footers). Upload page has "▶ Try the demo
  book" which fetches it and runs the normal extract → save → open flow.

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` 10 passing.
- Dev server: `/upload` 200 (no redirect), `/login` 307 → `/upload`, `/read/x` 200,
  `/demo/lighthouse.pdf` 200; `/api/extract` on the demo → 4 pages with correct text.
- Not verified in a browser: localStorage writes, sidebar live update, demo button click.

**Files changed**
- New: `lib/books/{types,local,supabase,index}.ts`, `components/library/LocalLibrarySidebar.tsx`,
  `public/demo/lighthouse.pdf`
- Changed: `lib/supabase/env.ts`, `lib/supabase/middleware.ts`, `app/(reader)/layout.tsx`,
  `app/(reader)/upload/page.tsx`, `app/(auth)/login/page.tsx`, `.env.local.example`,
  `.env.local` (local only)
- Removed: `lib/books.ts` (split into `lib/books/`)

**How to verify**
- Open http://localhost:3000 → lands on `/upload` with the "Local mode" note.
- Click "▶ Try the demo book" → reader opens "The Lighthouse at Marrow Point" (4 pages),
  sidebar lists it at 25%. Flip to page 3, reload → still on page 3, sidebar shows 75%.
- Upload your own PDF → appears at the top of the sidebar. Hover a book → × removes it.
- Chrome extension side panel works unchanged (no sign-in step now).

## 2026-09-06 — Reader interaction polish (single-route upload, reactive playback, play/pause)

**What changed**
1. **Upload is inline.** `components/book/UploadDropzone.tsx` (drag-drop / click / demo button)
   runs extract → save and hands the loaded book to the reader via a callback. `/read/new`
   shows it full-page when no book is loaded; "Open another PDF" shows it as a modal over a
   loaded book. Opening a book sets state and `history.replaceState('/read/<id>')` — no
   navigation, no remount. `/`, `/upload`, sidebars, login/callback and the extension all
   point at `/read/new` now; `/upload` is a redirect for old links.
2. **Selecting an avatar reads the current page.** `selectAvatar` sets `avatarId` and, if a
   book is open, arms playback (`playRequest` 0 → 1). With no book it only changes the model.
3. **Play/Pause toggle.** One button: Play / ⏸ Pause / ▶ Resume / Loading…. It only toggles the
   loaded `<audio>` (`pause()` / `play()`, resuming from `currentTime`) and never fetches;
   it arms/retries playback only when nothing is loaded for the current combo. Space bar
   toggles too. `useLipSync` now returns the mouth to neutral whenever the element is paused,
   ended or absent (previously a paused clip could freeze on its first cue).
4. **Avatar switch mid-play** and 5. **page flip mid-play** are both handled by one effect:
   `(book.id, currentPage, avatarId, voiceOverride)` is the single source of truth. On any
   change the effect (a) aborts the in-flight `/api/speak` via `AbortController`, (b) bumps a
   request id so a late response is ignored even if it resolves, (c) stops + detaches the
   current `<audio>` (handlers nulled first so its `pause` event can't flip UI state),
   (d) serves the new combo from an in-memory session cache or fetches it, (e) starts it.
   Old/new audio can't overlap because (c) always precedes (e) synchronously.
- Session cache: `Map<"bookId:page:avatarId:voice", clip>` — repeat visits to a page/voice are
  instant and free. The status line shows "· cached". This is per-tab memory; the persistent
  Supabase Storage cache from CLAUDE.md rule 2 is still outstanding (local mode has no Storage).
- Reading-position persistence now keys on `book.id` (not the route param) so it works for
  books opened inline.
- Status line, voice override, keyboard arrows, WebGL fallback: unchanged.

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` 10 passing.
- Dev server: `/` and `/upload` → 307 `/read/new`; `/read/new` and `/read/<unknown>` 200 with
  the drop-zone rendered; no stale `/upload` links in app/components/lib/extension.
- Not verified (needs a browser): the race/overlap behaviour, pause-resume position, autoplay.

**Files changed**
- New: `components/book/UploadDropzone.tsx`
- Rewritten: `app/(reader)/read/[bookId]/page.tsx`
- Changed: `components/avatar/useLipSync.ts`, `app/(reader)/upload/page.tsx` (redirect),
  `app/page.tsx`, `app/(auth)/login/page.tsx`, `app/auth/callback/route.ts`,
  `components/library/LibrarySidebar.tsx`, `components/library/LocalLibrarySidebar.tsx`,
  `lib/supabase/middleware.ts`, `extension/sidepanel.js`

**How to test manually**
- Open http://localhost:3000 → lands on `/read/new` with the drop-zone. Drop a PDF or click
  "Try the demo book" → the reader appears in place, URL becomes `/read/<id>`, no reload.
- Click an avatar card → the current page starts reading in that voice (first time: a few
  seconds of "Loading…").
- Click ⏸ Pause → audio stops, mouth relaxes. Click ▶ Resume → continues from the same spot.
- While playing, click a different avatar → old audio stops instantly, model swaps, same page
  starts in the new voice; never two voices at once. Rapidly click several avatars → only
  the last one ends up playing.
- While playing, press Next (or drag a page) → old audio stops, new page starts reading in the
  current avatar. Flip back → instant (cached).
- "Open another PDF" → modal drop-zone; loading a book swaps it in place.

## 2026-09-06 — Final phase: production polish + screenshot fixes

**Screenshot / UX fixes**
- **Sidebar "+ Upload PDF" did nothing** after a book had been opened inline (the reader had
  rewritten the URL with `replaceState`, so a Link to `/read/new` looked like a no-op to the
  router). It is now `components/library/UploadButton.tsx`: dispatches a cancelable
  `avatar-reader:open-upload` event; a mounted reader opens its drop-zone modal and cancels
  it, otherwise the button navigates. Switching books via the sidebar resets playback.
- Removed on-screen storage explanations ("Local mode · stored in this browser", drop-zone
  note). Status line shortened to avatar · engine.
- **Avatar framing**: camera now sits at eye height and looks slightly below the eyes
  (VRM distance 0.9 m, placeholder 1.6 m), so head + shoulders sit centred; canvas is
  400×640 next to the book on wide screens (matches book height), 360×360 stacked otherwise.
- **First play speed**: pages are split into sentence chunks (`lib/tts/chunk.ts`; first chunk
  ~110 chars, then ~240). Chunk 1 plays as soon as it returns (~3–5 s, Fish latency) while
  the rest generate 2-at-a-time; the next page is prefetched once the current one is fetched.
  Rhubarb now defaults to the `phonetic` recogniser (`RHUBARB_RECOGNIZER=pocketSphinx` to
  revert) and receives the dialog text. Clips persist in **IndexedDB** (+ memory) keyed by
  book/page/chunk/avatar/voice/text-hash (`lib/clip-cache.ts`) → repeat plays are instant
  across reloads and never re-spend TTS quota (CLAUDE.md rule 2, browser edition).
- **Pause + word highlighting**: `BookViewer` renders each page as word spans (memoised
  `BookPage`, `renderOnlyPageLengthChange` so page-flip isn't re-initialised on highlight
  changes). The reader tracks the playing chunk's `currentTime / duration`, maps it to a word
  via character-weighted fractions, and highlights it (amber) with `scrollIntoView`. Pause
  freezes the highlight and relaxes the mouth; Resume continues from the same word.
- **Background**: warm animated gradient (`.warm-bg` in `globals.css`: two blurred amber /
  rose-violet blobs drifting on 30 s / 38 s loops; disabled under `prefers-reduced-motion`).
  Sidebar is translucent with backdrop blur.

**Spec items**
1. Loading states — PDF extraction: spinner in the drop-zone ("Extracting text…" /
   "Saving…"); TTS: button shows "Loading…" + "Preparing audio n/N" with spinner while
   chunks generate/buffer; avatar model: spinner + "Loading <name>…" in the canvas; book
   load: spinner.
2. Errors — failed upload: inline red message in the drop-zone (non-PDF rejected client-side);
   TTS failure on both engines: red card with both engines' messages and a **Retry** button;
   missing `.vrm`: placeholder figure labelled "<name> · no 3D model"; WebGL missing:
   in-panel fallback; React error boundaries `app/error.tsx` and `app/(reader)/error.tsx`
   (Try again / Open another PDF).
3. Responsive — below 720 px container width the flip-book switches to single-page
   portrait and scales to fit (`ScaleToFit` render-prop → `orientation`, `BookViewer` keyed
   on it); controls wrap; avatar canvas full-width; Library becomes a slide-over (from the
   extension phase). Verified by layout math only — no device testing here.
4. Secrets audit — no `'use client'` file references `process.env` beyond `NEXT_PUBLIC_*`;
   `FISH_AUDIO_API_KEY` / `SERVICE_ROLE` appear only in `app/api/*`, `lib/tts/*`,
   `lib/supabase/server.ts`, `lib/supabase/middleware.ts`; no client file imports
   `lib/tts/{fish,piper,rhubarb}` or `lib/supabase/server`.
5. `README.md` — stack, quick start, full env-var table (with where each is read), binaries,
   avatars, playback design, Supabase mode, extension, scripts.

**Verified**
- `npm run build` (isolated copy, final code) clean; `tsc` + `next lint` clean;
  `npm test` → 16 passing (chunking + timing tests added).
- Dev server: `/read/new` 200; `/api/speak` on a 211-char chunk → Fish, 61 visemes, ~5 s.
- Not verified in a browser: highlight sync feel, chunk hand-off gaps, IndexedDB persistence,
  portrait layout on a phone, the animated background's GPU cost on low-end devices.

**Known limits**
- Word timing is estimated (character-weighted per chunk), not measured — expect ±1 word.
- There can be a brief gap between chunks (new `<audio>` per chunk).
- Fish quota is spent once per chunk per avatar/voice; the cache is per browser (IndexedDB).

**Files changed**
- New: `lib/tts/chunk.ts`, `lib/clip-cache.ts`, `lib/events.ts`,
  `components/library/UploadButton.tsx`, `app/error.tsx`, `app/(reader)/error.tsx`,
  `tests/chunk.test.ts`, `README.md`
- Rewritten: `app/(reader)/read/[bookId]/page.tsx`, `components/book/BookViewer.tsx`,
  `components/book/ScaleToFit.tsx`, `lib/tts/rhubarb.ts`
- Changed: `app/api/speak/route.ts`, `components/avatar/AvatarCanvas.tsx`,
  `components/book/UploadDropzone.tsx`, `components/library/ReaderShell.tsx`,
  `components/library/LibrarySidebar.tsx`, `components/library/LocalLibrarySidebar.tsx`,
  `app/globals.css`, `.env.local.example`, `.env.local` (local)

**How to verify**
- Open a book, click an avatar: "Preparing audio 1/N" for a few seconds, then speech starts
  while the counter keeps climbing; words highlight in the page as they're spoken.
- Pause → highlight and mouth freeze; Resume → continues from the same word.
- Reload, click the same avatar → starts instantly (IndexedDB cache).
- Press Next while playing → new page starts (near-instant if prefetched). Prev → instant.
- Sidebar "+ Upload PDF" while a book is open → modal drop-zone; drop a non-PDF → red message.
- Rename `public/avatars/alex.vrm` temporarily → Alex shows the placeholder labelled
  "Alex · no 3D model". Stop Fish + Piper (bad key, `PIPER_PATH=nope`) → red card with Retry.
- Narrow the window below ~720 px → single-page book, wrapped controls, ☰ Library.
