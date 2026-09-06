# Avatar Reader

Upload a PDF and have it read aloud, page by page, by a lip-synced, blinking 3D avatar in a
page-flipping book. Seven avatars, each with its own voice and personality.

- **Next.js 14** (App Router, TypeScript strict, Tailwind)
- **PDF text**: pdfjs-dist · **Book UI**: react-pageflip · **3D**: three / react-three-fiber / @pixiv/three-vrm
- **TTS**: Fish Audio (primary, REST) with **Piper** (self-hosted) fallback · **Lip-sync**: Rhubarb
- **Persistence**: local mode (browser storage, default) or Supabase (auth + DB + Storage)

## Quick start (local mode, no accounts)

```bash
npm install
cp .env.local.example .env.local      # then fill in FISH_AUDIO_API_KEY (optional) + binary paths
npm run dev                            # http://localhost:3000
```

Then install the two binaries below, drop `.vrm` models in `public/avatars/`, and click
**Try the demo book**.

## Required environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_LOCAL_MODE` | client+server | no (default `true` when Supabase is unset) | `true` = no sign-in, books in localStorage |
| `FISH_AUDIO_API_KEY` | **server only** | no | Fish Audio TTS. Without it every request uses Piper |
| `RHUBARB_PATH` | server | no (default `rhubarb` on PATH) | Path to the Rhubarb binary |
| `RHUBARB_RECOGNIZER` | server | no (default `phonetic`) | `phonetic` (fast) or `pocketSphinx` (slower, more accurate) |
| `PIPER_PATH` | server | no (default `piper` on PATH) | Path to the Piper CLI |
| `PIPER_VOICES_DIR` | server | no (default `~/piper-voices`) | Folder holding `<voice>.onnx` + `.onnx.json` |
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | only for Supabase mode | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client+server | only for Supabase mode | Public key (either name) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | no (unused so far) | Reserved for server-side admin work |

Secrets (`FISH_AUDIO_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are read only inside
`app/api/*` route handlers and `lib/tts/*`; no `'use client'` file touches them.

## System binaries

Both are free and need no account. Full instructions, including the macOS-specific Piper
install and voice downloads, are in [SETUP.md](SETUP.md).

- **Rhubarb Lip Sync** — turns generated speech into mouth-shape timings.
- **Piper TTS** — local neural TTS; the zero-cost fallback when Fish Audio is unavailable.
  Voices used: `en_US-ryan-high`, `en_US-amy-medium`, `en_GB-alan-medium`,
  `en_US-lessac-medium`, `en_US-libritts_r-medium`, `en_US-joe-medium`.

## Avatars

`lib/avatars.ts` is the registry (id, name, personality, Fish `reference_id`, emotion tag,
Piper voice). Put models at `public/avatars/<id>.vrm` (VRM 0.x or 1.0, needs a `blink`
expression and the `aa/ih/ou/ee/oh` vowel presets) and optional thumbnails at
`public/avatars/<id>.png`. Missing models render as a placeholder figure that still blinks
and lip-syncs.

Fish `reference_id`s ship empty (Fish's default voice). Copy real ids from
fish.audio/voice-library; the **Voice** dropdown's *Custom* option lets you audition one.

## How playback works

Each page is split into short sentence chunks. The first chunk plays as soon as it's
synthesised while the rest stream in behind it; the next page is prefetched in the
background. Every clip is cached (memory + IndexedDB) per book/page/chunk/avatar/voice, so
repeat plays are instant and never re-spend TTS quota. Changing page or avatar cancels
whatever is in flight and starts the new combination — old and new audio never overlap.

## Supabase mode (optional)

Set `NEXT_PUBLIC_LOCAL_MODE=false` and the Supabase variables, run
`supabase/migrations/0001_init.sql`, and configure auth redirect URLs. Details in SETUP.md.

## Chrome extension

`extension/` is a Manifest V3 side-panel wrapper around the running app. See
[extension/README.md](extension/README.md).

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build + type-check + lint
npm start        # serve the build
npm test         # vitest
```

## Project log

`PROGRESS.md` records every phase: what was built, files touched, how to verify.
