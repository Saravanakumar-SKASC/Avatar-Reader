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

## 2026-09-06 — Demo polish: collapsible library, re-flowed pages, auto-advance, speed, full-screen layout

**What changed**
1. **Library panel opens/closes** on wide screens (« / » button top-left, state remembered in
   `localStorage`); the slide-over stays for narrow screens. `ReaderShell` is now a
   `h-screen overflow-hidden` frame — the reader never scrolls the window.
2. **Pages no longer clip.** `lib/paginate.ts` re-flows each PDF page's text into as many
   480×640 book pages as needed, measuring words with a canvas 2D context using the exact
   font string the page CSS uses (`15px Georgia, 'Times New Roman', serif`, 24 px lines,
   36 px padding). Falls back to a char estimate outside the browser. Book page count
   replaces PDF page count for progress % (`saveProgress` now carries the total; local and
   Supabase stores update `page_count`). Saved positions are clamped to the new count.
   **Auto-advance:** when a page's last chunk ends, the reader flips to the next page and
   keeps reading until the book ends.
3. **Voices differ per avatar.** Fish `reference_id`s are populated for all 7 (the values in
   `lib/avatars.ts` were filled in by hand from fish.audio/voice-library; two were
   verified live to return distinct audio). `/api/speak` echoes the id used.
4. **Speed 0.75× / 1× / 1.5× / 2×** — segmented control; implemented as `audio.playbackRate`
   (pitch-preserving in modern browsers). Instant, applies to the playing clip, persists in
   `localStorage`, and keeps the clip cache valid. Lip-sync and word highlight both key off
   `audio.currentTime`, so they stay in sync at any speed.
5. **Single-screen storytelling layout**: header (serif title + "Open another PDF"), a stage
   where the avatar (5:8 panel, full stage height) and the book share the remaining height —
   `ScaleToFit` now scales to fit height as well as width — and a glass control bar with the
   compact avatar strip (glowing ring on the selected narrator), ⏮ ▶/⏸ ⏭ transport, page
   counter, speed pills, voice dropdown and a one-line status. Warm animated background kept.

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` → 19 passing
  (`tests/paginate.test.ts` added: word coverage, line budget, per-PDF-page breaks).
- Dev server: `/read/new` 200; `/api/speak` for `luna` and `brian` → Fish with their own
  reference ids and emotion tags.
- Not verified in a browser: pagination accuracy vs. real font rendering (canvas measurement
  matches CSS on the same machine; a 36 px padding + 28 px footer margin is reserved),
  auto-advance feel, speed pitch quality, layout at 1366×768 and phone sizes.

**Files changed**
- New: `lib/paginate.ts`, `tests/paginate.test.ts`
- Rewritten: `components/library/ReaderShell.tsx`, `components/book/ScaleToFit.tsx`,
  `components/avatar/AvatarPicker.tsx`
- Changed: `app/(reader)/read/[bookId]/page.tsx`, `components/book/BookViewer.tsx`,
  `components/avatar/VoiceOverride.tsx`, `lib/avatars.ts` (comment), `lib/books/{types,local,supabase}.ts`,
  `README.md`

**How to verify**
- Open a long PDF: no page is cut off; page count is larger than the PDF's; the footer
  shows book page / total.
- Click an avatar → it reads; when the page ends the book flips itself and continues.
- Switch avatars mid-sentence → clearly different voice, no overlap.
- Speed pills: 2× is audibly faster, same pitch, highlight keeps pace.
- « hides the library; reload keeps it hidden; » brings it back.
- Everything (header, avatar, book, control bar) fits without scrolling at desktop sizes.

## 2026-09-06 — Demo fixes: sidebar overlap, full pages, avatar-driven voice, portrait thumbnails

**What changed**
1. **Sidebar no longer overlaps the avatar.** The avatar panel had an unbounded aspect-ratio
   width, so the stage overflowed under the docked library and past the right edge. It is now
   a bounded column (`clamp(200px, 26vw, 400px)` on desktop, 30 vh tall on narrow screens)
   and the stage is `min-w-0 overflow-hidden`; the book scales to whatever is left.
2. **Pages are full.** `lib/paginate.ts` now flows the whole book as one word stream, so a
   PDF page break is no longer a book page break (previously each PDF page started a fresh
   book page, leaving half-empty pages). Empty PDF pages vanish; `source` still records the
   PDF page of a page's first word. Tests updated (20 passing).
3. **Voice follows the avatar, always.** The Voice override dropdown pinned a voice (it showed
   "Luna" while other avatars were selected). Removed `components/avatar/VoiceOverride.tsx`
   and the override state; the legacy `avatar-reader:voice-override` localStorage key is
   cleared on load. The `/api/speak` `voiceOverride` parameter still exists for API callers.
4. **Real portraits in the picker.** All seven `.vrm` files carry an embedded VRM 1.0
   `meta.thumbnailImage`; extracted them with a small Python script (GLB binary chunk →
   PNG), downscaled to 256 px with `sips`, saved as `public/avatars/<id>.png`
   (48–88 KB each). `AvatarPicker` already preferred `<id>.png`, so pictures replace letters
   with no code change; the letter badge remains only as a fallback for a missing file.

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` → 20 passing.
- Dev server: `/read/new` 200; `/avatars/{alex,luna,sam}.png` 200 `image/png`.
- Not verified in a browser: the stage layout at your window size, page fill on the real font.

**Files changed**
- `app/(reader)/read/[bookId]/page.tsx`, `lib/paginate.ts`, `tests/paginate.test.ts`
- New: `public/avatars/*.png` (7 thumbnails) · Removed: `components/avatar/VoiceOverride.tsx`

**How to verify**
- Toggle « / » with a book open: the avatar and book stay inside the content column.
- Every book page is filled to the bottom line (except the last).
- Click Alex, then Luna, then Sam: the voice changes each time, with no dropdown involved.
- The narrator strip shows each character's face.

## 2026-09-06 — Read-along highlight actually shows

**Bug**
- Word highlighting (added in the final-phase pass) never appeared. `react-pageflip` renders
  its children from a `pages` state copy; with `renderOnlyPageLengthChange` that copy is only
  refreshed when the page count changes, so the `activeWord` prop never reached the DOM.
  Dropping the flag would instead rebuild the whole page-flip collection on every word.

**Fix**
- `BookPage` is now static: each word is `<span data-w={i} class="read-word">`, each page
  `data-page={i}`. `BookViewer` applies the highlight imperatively in an effect on
  `highlight`: `.read-word--now` on the spoken word (solid amber, dark text, 2 px glow) and
  `.read-word--phrase` on every word of the TTS chunk being read (soft amber tint), so
  listeners can see the phrase the narrator is heading through. Classes are cleared before
  each update; all DOM copies of a page (page-flip clones one mid-flip) are updated.
- `WordHighlight` gained `from`/`to`; the reader sets the phrase range the moment a chunk
  starts (before the first timing tick) and updates `word` from the audio clock.
- CSS in `app/globals.css`.

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` 20 passing.
- Dev server: `/read/new` 200; compiled `layout.css` contains `read-word--now` /
  `read-word--phrase`.
- Not verified in a browser: the visual result and sync feel.

**Files changed**
- `components/book/BookViewer.tsx`, `app/(reader)/read/[bookId]/page.tsx`, `app/globals.css`

## 2026-09-06 — Emotional facial expressions from text sentiment

**Note:** the prompt referenced three pasted code blocks that did not arrive; the
implementations below were written to the stated spec.

**What was built**
1. `lib/emotion/classify-local.ts` — default, free, local. `@huggingface/transformers` 4.2
   (`pipeline('text-classification', 'SamLowe/roberta-base-go_emotions-onnx', { dtype: 'q8' })`,
   lazy singleton, ~130 MB quantized weights downloaded once to `EMOTION_MODEL_CACHE`,
   default `./.cache/transformers`, git-ignored). GoEmotions' 28 labels are mapped onto the
   five VRM expressions (`reduceLabels`: sums top-5 scores per target, neutral below 0.25).
   Measured: 7 s first load, ~5 ms per sentence after.
2. `lib/emotion/classify-openai.ts` — optional; used only when `OPENAI_API_KEY` is set.
   Plain `fetch` to Chat Completions (`gpt-4o-mini`, temperature 0, strict JSON schema, one
   label per sentence). Falls back to local on any error.
3. `app/api/emotion/route.ts` — POST `{ sentences[] }` → `{ labels[], engine }` (max 200).
   Timeline building: `lib/emotion/timeline.ts` — `splitSentences` (same tokenisation as the
   TTS chunker, so word indices line up), `buildTimeline` → `[{ startWord, endWord, emotion,
   score }]` (duration ∝ words by construction), `cuesForChunk` projects it onto one audio
   clip as `[{ start, end, emotion, score }]` in fractions of the clip's duration using the
   chunk's word-timing fractions. The reader fires classification in the same run that
   fetches audio/visemes and prefetches the next page's emotions too.
4. Cache: `lib/emotion/page-emotions.ts` — memory + IndexedDB `emotions` store, key
   `bookId:pageId:textHash` — **no avatar in the key**; every avatar reading the page reuses
   it. In-flight de-dupe. (`clip-cache.ts` bumped the DB to v2 to add the store.)
5. `components/avatar/useEmotion.ts` — one more `useFrame` layer registered right after
   `useLipSync` and before `vrm.update` (viseme and blink hooks untouched). Picks the cue at
   `audio.currentTime / duration`, eases `happy/angry/sad/relaxed/surprised` toward
   `min(0.6, score·0.6 + 0.2)` with `delta * 4` (mouth uses 12) so moods hold across a
   sentence; paused/ended/no audio → all ease to 0. Placeholder figure got eyebrows that
   tilt (angry/sad) or lift (surprised) so the layer is visible without a VRM.
   `AvatarCanvas` takes `emotionCues`; the reader publishes cues per clip and refreshes them
   if the timeline arrives mid-clip (audio is never blocked on classification).
- `next.config.mjs`: `@huggingface/transformers`, `onnxruntime-node` added to server externals.
- `vitest.config.mts`: `@` alias (needed once lib code imported via `@/`).
- `tests/emotion.test.ts` — sentence splitting, label reduction, timeline→cue projection
  (whole-chunk and mid-sentence chunk). 25 tests total.

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` 25 passing.
- Live `/api/emotion` on the dev server: "She laughed out loud and hugged him." → happy 0.99,
  "He slammed the door and cursed." → angry 0.41, "The report is due on Monday." → neutral,
  "What on earth is that noise?" → surprised 0.90; `engine: local`, 0.8 s round-trip warm.
- Not verified in a browser: the expressions on the VRMs (all seven have the presets), the
  blend cap interacting with mouth shapes, and OpenAI path (no key set).

**Files changed**
- New: `lib/emotion/{types,classify-local,classify-openai,timeline,page-emotions}.ts`,
  `app/api/emotion/route.ts`, `components/avatar/useEmotion.ts`, `tests/emotion.test.ts`
- Changed: `components/avatar/AvatarCanvas.tsx`, `app/(reader)/read/[bookId]/page.tsx`,
  `lib/clip-cache.ts`, `next.config.mjs`, `vitest.config.mts`, `.gitignore`,
  `.env.local.example`, `.env.local` (local), `README.md`, `package.json` (+@huggingface/transformers)

**How to test**
- Restart `npm run dev` (next.config changed). Open the demo book and play: on "She wept…"
  style lines the face should soften/sadden, on exclamations widen, on cheerful lines smile —
  gently (≤ 0.6) and lagging a beat behind the words, never twitching per syllable.
- Switch avatars mid-page: no new `/api/emotion` call in the Network tab (page-level cache).
- Reload and replay: still no classification call (IndexedDB).
- Set `OPENAI_API_KEY` in `.env.local`, restart → `/api/emotion` responds `engine: "openai"`.

## 2026-09-06 — Book viewer: stretch sizing, real covers, physical-book styling

**Note:** the prompt referenced pasted CoverPage/BackCoverPage, props and CSS blocks that did
not arrive; the implementation below was written to the stated spec.

**What changed**
1. **`size="stretch"`.** `HTMLFlipBook` now gets `width/height` 480×640 as the page *ratio*,
   `minWidth 320 / maxWidth 760` and matching min/max heights, `autoSize={false}`. In stretch
   mode page-flip sizes pages from its parent's width *and* clamps to its height, so the new
   `components/book/BookFrame.tsx` measures the stage and gives the flip-book a container of
   exactly the size page-flip will use (`lib/book-metrics.ts › computeMetrics` mirrors
   page-flip's `calculateBoundsRect`; tested). Page *content* stays a fixed 480×640 layer
   scaled by a `--page-scale` CSS variable, so `lib/paginate` remains exact at every size.
   On container changes (sidebar toggle) the viewer calls `pageFlip().update()`.
   `ScaleToFit.tsx` removed.
2. **Covers.** `CoverPage` (hard) is the first leaf: leather gradient, gilt double border
   (`border` + offset `outline`), ❦ ornament, centred title (balanced wrap), italic author
   when the row has one, "Avatar Reader" imprint. `BackCoverPage` (hard) closes the book with
   "The End" + title. Title/author come from the book row (`books.title` / `books.author`;
   local mode stores the same shape). Text pages therefore sit at flip index `page + 1`;
   `onFlip` ignores the covers so the reader's `currentPage` only ever points at real text.
   First visit (no saved position) opens on the cover and flips in when reading starts;
   returning visits open on the saved page.
3. **Interior.** Justified serif text with `hyphens: auto`; spine-aware padding — 44 px on
   the gutter side, 28 px on the outer edge (still 72 px total, matching `PAGE_BOX`); a soft
   inset gutter shadow per side; folio number on the outer corner; rounded outer corners
   per leaf; the whole book wrapped in `.book` with a layered `drop-shadow` (so the
   turning page is not clipped) and 8 px radius. Portrait mode uses symmetric padding.
4. **`drawShadow` kept** (and `maxShadowOpacity 0.5`).

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` → 29 passing
  (`tests/book-frame.test.ts`: landscape height-limited, width-limited, portrait switch, maxWidth cap).
- Dev server: `/read/new` 200; compiled CSS contains `cover__title`, `leaf--left`,
  `book-frame--portrait`, `page-scale`.
- Not verified in a browser: the look of the covers and gutters, hard-cover flip feel, that
  the `--page-scale` layer lines up with page-flip's computed page size at odd stage sizes.

**Files changed**
- New: `components/book/BookFrame.tsx`, `lib/book-metrics.ts`, `tests/book-frame.test.ts`
- Rewritten: `components/book/BookViewer.tsx`
- Changed: `app/(reader)/read/[bookId]/page.tsx`, `app/globals.css`
- Removed: `components/book/ScaleToFit.tsx`

**How to look at it**
- Open a book fresh (or "Open another PDF"): it rests on the cover — title centred inside a
  gold double border. Click Play or an avatar: the cover turns and reading starts on page 1.
- Toggle the library («/»): the book re-fits the stage; text stays crisp and un-clipped.
- Narrow the window: single-page portrait with symmetric margins. Widen: two-page spread with
  the wider margin on the spine side and the folio on the outer corner.
- Flip to the very end: "The End" back cover; flipping onto it doesn't change the page counter.

## 2026-09-06 — Measured word timestamps for the read-along highlight (Whisper)

**Note:** the prompt referenced pasted extraction/PageText code that did not arrive; written
to the stated spec. Item 3 (one `<span>` per word) was already in place from the read-along
work; the change here is replacing *estimated* word timing with *measured* timing.

**What was built**
1. `lib/timing/extract-word-timestamps.ts` — server-only; `@huggingface/transformers`
   `pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en_timestamped',
   { dtype: 'q8' })` with `return_timestamps: 'word'`. The plain `whisper-tiny.en` export
   lacks cross-attention outputs and throws for word timestamps — the `_timestamped` exports
   are required (env `WHISPER_MODEL` to swap; `WORD_TIMESTAMPS=off` to disable).
   `lib/timing/wav-decode.ts` parses PCM WAV (8/16/24/32-bit, float, streaming size
   placeholders) and resamples to 16 kHz mono. `lib/timing/align.ts › alignWords` does an
   LCS-style monotonic alignment of Whisper's words to the words actually sent to the TTS
   (normalised; prefix / 1-edit fuzzy match), takes Whisper's timestamps for matches and
   interpolates unmatched runs by character weight, then enforces monotonic order — so
   every source word has a `[start, end)` even when Whisper mishears.
2. `/api/speak` runs Rhubarb and Whisper in parallel on the same WAV and returns
   `words: WordTiming[] | null` alongside `visemes`. The client stores it in the clip cache —
   **per (book, page, chunk, avatar, voice, text)**, the same key as the audio, because pace
   differs per voice. `null` on any extraction failure (logged server-side).
3. Page rendering: unchanged — `TextPage` already renders `<span data-w={i}>` per word.
4. `wordAtTime(words, t)` (binary search) — the reader's rAF loop uses it with
   `audio.currentTime` when the clip has measured words (and the count matches the chunk),
   else the old proportional `wordAtFraction`. Highlight classes are applied as before.
- `tests/align.test.ts` — matched, misheard/missing, nothing-recognised, normalisation,
  `wordAtTime`. 34 tests total.

**Verified**
- Probe: 2 s Fish clip → Whisper loads in ~4 s, transcribes in 0.8 s, word boundaries
  correct ("Hello." 0.52–0.86, "This" 1.04–1.24, …).
- Live `/api/speak` (dev server): 14-word sentence → `words: 14`, monotonic, sentence gap
  visible (1.84 → 2.08 s), whole call (Fish + Rhubarb + Whisper) ~3.0 s.
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` 34 passing.
- Not verified in a browser: the highlight tracking speech by ear.

**Files changed**
- New: `lib/timing/{extract-word-timestamps,wav-decode,align}.ts`, `tests/align.test.ts`
- Changed: `app/api/speak/route.ts`, `types/tts.ts`, `lib/clip-cache.ts`,
  `app/(reader)/read/[bookId]/page.tsx`, `.env.local.example`, `.env.local` (local), `README.md`

**How to test**
- Clear the old clip cache once so clips are regenerated with timings: DevTools →
  Application → IndexedDB → `avatar-reader` → `clips` → clear (or open a new book).
- Play a page: the amber word should now land exactly on the spoken word, including the
  pause after full stops. Change speed to 2×: still in step (timings are in media time).
- Set `WORD_TIMESTAMPS=off`, restart, clear cache, play: highlight reverts to the estimate.

## 2026-09-06 — Natural, state-aware avatar motion (replaces the Y-bounce idle)

**Note:** the prompt referenced four pasted code blocks that did not arrive; written to the
stated spec.

**Removed**
- The bounce: `useIdle` in `AvatarCanvas.tsx` animated `group.position.y` with a sine wave
  (plus a small yaw/roll sway) on the whole model. Gone. The placeholder figure keeps a
  rotation-only `useSway` (no position change) since it has no bones.

**One loop.** `VrmModel` now has a single `useFrame` callback. The existing blink, lip-sync and
emotion hooks were refactored into driver factories (`createBlinkDriver`, `createLipSyncDriver`,
`createEmotionDriver` — logic unchanged, the hook forms remain for the placeholder) and are
stepped in order: blink → visemes → emotion timeline → motion → `vrm.update(delta)`.
`playing = audio && !paused && !ended`; `idle = !playing`.

**`components/avatar/motion.ts › createMotionDriver(vrm, { bookPoint, viewerPoint })`**
1. **Rest pose captured once** for hips, spine, chest, upperChest, neck, head, both shoulders
   (`getNormalizedBoneNode(...).quaternion.clone()`). Every frame sets
   `bone.quaternion = rest × offset(euler)` — relative to rest, never accumulated, so a long
   session cannot drift (test: 10 simulated minutes, head stays within micro-movement range).
2. **Always on:** breathing — chest/upperChest/spine pitch on a 4.3 s sine with a matching
   shoulder rise; head micro-movement — layered sines on yaw (0.61 + 1.93 Hz), pitch
   (0.87 + 2.41 Hz), roll (0.47 Hz), amplitudes ≤ 0.022 rad, 40 % echoed on the neck.
   A per-instance random phase keeps multiple avatars from moving in unison.
3. **Gaze:** a real `THREE.Object3D` (`lookTarget`, mounted in the scene via `<primitive>`)
   assigned to `vrm.lookAt.target`. Reading → eases to `bookPoint` (screen-right of the
   avatar, a little below eye level). Idle → picks a random point near the viewer (±0.45 m x,
   ±0.2 m y/z), 30 % of the time straight at the viewer, holds 2–6 s, then re-rolls.
   Position lerp `delta·2.5`.
4. **Idle-only gestures** every 10–25 s: head tilt (0.14 rad roll + slight nod), shoulder roll
   (0.09 rad), or micro-smile (up to 0.3 on `happy`, *added* to the emotion driver's weight —
   the emotion driver now returns weights instead of applying them so the two layers can sum).
   Each is a 2.2 s smooth bump. If playback starts mid-gesture the gesture fades out over
   ~0.17 s; the countdown pauses while reading. Test: zero smile over 2 simulated minutes of
   playback.

**Verified**
- `npm run build` (isolated) clean; `tsc` + `lint` clean; `npm test` → 37 passing
  (`tests/motion.test.ts`: no drift over 10 min, no gestures while playing, gaze targets).
- Dev server: `/read/new` 200.
- Not verified in a browser: the feel of the amplitudes on your VRMs (all constants are at the
  top of `motion.ts`), and whether `bookPoint` reads as "looking at the book" from your camera.

**Files changed**
- New: `components/avatar/motion.ts`, `tests/motion.test.ts`
- Rewritten: `components/avatar/useBlink.ts`, `components/avatar/useLipSync.ts`,
  `components/avatar/useEmotion.ts` (same behaviour, driver + hook forms)
- Changed: `components/avatar/AvatarCanvas.tsx`

**How to test**
- Idle on a page: no vertical bobbing; a slow breath in the chest, tiny head drift, eyes
  wandering and occasionally meeting yours; every 10–25 s a tilt, a shoulder roll or a small
  smile.
- Press Play: eyes settle toward the book; breathing and micro-movement continue; no
  tilts/smiles while speaking. Pause: gestures resume after ≥10 s.
- Leave it running 10+ minutes: the pose is unchanged.
