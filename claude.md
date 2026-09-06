# Avatar Reader — Project Memory

## What this is
A web app that turns an uploaded PDF into a narrated, page-flipping book experience
with a lip-synced, blinking 3D avatar reading aloud. Multiple selectable avatars,
each with a distinct voice and personality.

## Tech stack — do not deviate without asking first
- Next.js 14 (App Router), TypeScript strict mode, Tailwind CSS
- PDF parsing: pdfjs-dist
- Book UI: react-pageflip
- 3D: three, @react-three/fiber, @react-three/drei, @pixiv/three-vrm
- TTS (primary): Fish Audio REST API, model `s2.1-pro-free` — server-side only
- TTS (fallback): Piper TTS, self-hosted binary, zero cost, no account
- Lip-sync: Rhubarb Lip Sync (self-hosted binary) analyzing generated audio —
  used identically for both TTS engines, since neither returns native visemes
- DB / Auth / Storage: Supabase

## Hard rules
1. Fish Audio keys and Supabase service-role keys are NEVER used in client
   components — only inside app/api/* route handlers.
2. Cache TTS audio + viseme JSON per (bookId, pageId, avatarId, voiceId) in
   Supabase Storage. Never regenerate audio for a combo that's already cached.
3. Keep each phase's diff scoped to exactly what that phase's prompt asks. Do not
   start later-phase work even if it seems convenient.
4. Before declaring a phase done: run `npm run build`, fix every TypeScript/lint
   error, then STOP and report what to test manually. Do not auto-advance phases.
5. After every phase, append a dated entry to PROGRESS.md: what was built, which
   files changed, how to verify it.
6. Fish Audio's free tier is a time-limited developer offer — the Piper fallback
   path must keep working at all times, not just exist in theory.

## Avatar / voice registry
Fish `reference_id` values are placeholders — get real ones from
fish.audio/voice-library (browse, preview, copy the `reference_id` shown for
each voice). Piper voice names below are real current model names.

| id | name | personality | Fish reference_id | emotion tag | Piper fallback voice |
|---|---|---|---|---|---|
| alex | Alex | Friendly | `<fill-in>` | `[friendly]` | en_US-ryan-high |
| luna | Luna | Calm | `<fill-in>` | `[calm]` | en_US-amy-medium |
| brian | Brian | Wise | `<fill-in>` | (none) | en_GB-alan-medium |
| ava | Ava | Cheerful | `<fill-in>` | `[cheerful]` | en_US-lessac-medium |
| professor | Professor | Classic | `<fill-in>` | (none) | en_GB-alan-medium |
| zara | Zara | Energetic | `<fill-in>` | `[excited]` | en_US-libritts_r (speaker N) |
| sam | Sam | Warm | `<fill-in>` | `[friendly]` | en_US-joe-medium |

Only `excited`, `happy`, `sad`, `angry`, `laughing`, plus intensity modifiers
(`slightly`/`very`/`extremely`) are confirmed emotion tags. Treat `calm` /
`cheerful` / `friendly` as untested — if a tag has no audible effect, drop it and
let voice selection alone carry the personality.