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
| `OPENAI_API_KEY` | **server only** | no | If set, sentence emotions are classified by OpenAI instead of the local model |
| `OPENAI_EMOTION_MODEL` | server | no (default `gpt-4o-mini`) | OpenAI model for emotion classification |
| `EMOTION_MODEL` | server | no (default `SamLowe/roberta-base-go_emotions-onnx`) | Local Hugging Face model id |
| `EMOTION_MODEL_CACHE` | server | no (default `./.cache/transformers`) | Where local models (emotion ~130 MB, Whisper ~40 MB) are downloaded once |
| `WHISPER_MODEL` | server | no (default `onnx-community/whisper-tiny.en_timestamped`) | Whisper export used for word timestamps (must be a `_timestamped` export) |
| `WORD_TIMESTAMPS` | server | no (default on) | `off` skips Whisper; the highlight then uses proportional estimates |

Secrets (`FISH_AUDIO_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are read only inside
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

Each avatar has its own Fish `reference_id` from fish.audio/voice-library; the **Voice**
dropdown's *Custom* option lets you audition another id before changing the registry.

## How playback works

PDF pages are re-flowed into book pages that fit the page box, so nothing is clipped.
Each book page is split into short sentence chunks. The first chunk plays as soon as it's
synthesised while the rest stream in behind it; the next page is prefetched in the
background. Every clip is cached (memory + IndexedDB) per book/page/chunk/avatar/voice, so
repeat plays are instant and never re-spend TTS quota. Changing page or avatar cancels
whatever is in flight and starts the new combination — old and new audio never overlap.
When a page finishes it advances to the next automatically.

**Word highlight.** Every clip also goes through Whisper (`@huggingface/transformers`,
`return_timestamps: 'word'`, free and local). The recognised words are aligned back to the
text that was sent to the TTS, so each word gets a measured start/end; these timings are
cached with the clip (per book/page/chunk/avatar/voice, since pace differs per voice) and
drive the amber read-along highlight from `audio.currentTime`. If Whisper is unavailable the
highlight falls back to proportional estimates.

**Facial expressions.** At the same step, the page's sentences are classified for emotion —
locally and for free with `@huggingface/transformers` (GoEmotions, ONNX, downloaded once), or
via OpenAI when `OPENAI_API_KEY` is set — and turned into a timeline that is cached per
book page (not per avatar). The avatar's render loop blends `happy / angry / sad / relaxed /
surprised` toward that timeline, capped at 0.6 and eased more slowly than the mouth, on top
of the untouched lip-sync and blink layers. Speed (0.75× – 2×) is a
playback-rate change, so it's instant and doesn't invalidate the cache.

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

