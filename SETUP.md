# Setup

## Prerequisites

- Node.js 18.17+ (developed on Node 25)
- npm

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

## System binaries (needed from the TTS / lip-sync phases onward)

Neither binary is required for Phase 0. Install them before starting the
lip-sync and Piper-fallback phases. Both are self-hosted, free, and need no account.

### Rhubarb Lip Sync (`rhubarb`)

Analyzes a WAV/OGG file and emits mouth-shape (viseme) timings as JSON. Used
for both the Fish Audio and Piper paths, since neither engine returns visemes.

1. Download the latest release for your OS from
   https://github.com/DanielSWolf/rhubarb-lip-sync/releases
   (e.g. `Rhubarb-Lip-Sync-<version>-macOS.zip`, `-Linux.zip`, `-Windows.zip`).
2. Unzip it. The archive contains the `rhubarb` executable plus a `res/`
   folder — keep them together; `rhubarb` looks for `res/` next to itself.
3. Put the extracted folder somewhere stable (e.g. `~/bin/rhubarb/`) and either
   add it to your `PATH` or point the app at it via `RHUBARB_PATH` (env var,
   used by the app; defaults to `rhubarb` on PATH).
4. macOS: on first run Gatekeeper may block it. Run
   `xattr -dr com.apple.quarantine ~/bin/rhubarb` or allow it in
   System Settings → Privacy & Security.
5. Verify:

   ```bash
   rhubarb --version
   rhubarb -f json -o out.json input.wav
   ```

### Piper TTS (`piper`)

Local neural text-to-speech. Zero cost fallback for Fish Audio.

**macOS (recommended — the GitHub tarballs are broken on macOS):** the
`piper_macos_aarch64.tar.gz` release ships an Intel binary and is missing the
dynamic libraries it links against, so it fails with `Library not loaded:
@rpath/libespeak-ng.1.dylib`. Use the Python package instead, which provides the
same `piper` CLI and flags:

```bash
uv venv ~/bin/piper-venv --python 3.12      # or: python3 -m venv ~/bin/piper-venv
uv pip install --python ~/bin/piper-venv/bin/python piper-tts
#   (or: ~/bin/piper-venv/bin/pip install piper-tts)
~/bin/piper-venv/bin/piper --help
```

Then set `PIPER_PATH=~/bin/piper-venv/bin/piper` in `.env.local`.

**Linux / Windows:**

1. Download the binary for your platform from
   https://github.com/rhasspy/piper/releases
   (e.g. `piper_linux_x86_64.tar.gz`, `piper_windows_amd64.zip`).
2. Extract it. The archive contains the `piper` executable and its shared
   libraries (`espeak-ng-data/`, `libonnxruntime`, etc.) — keep them together.
3. Put the folder somewhere stable (e.g. `~/bin/piper/`) and either add it to
   `PATH` or point the app at it via `PIPER_PATH` (env var, used by the app;
   defaults to `piper` on PATH).

**Voice models (all platforms):**

Each voice is a pair of files: `<voice>.onnx` and `<voice>.onnx.json`.
   Browse and download from
   https://huggingface.co/rhasspy/piper-voices/tree/main
   (voices are organized by language, e.g. `en/en_US/ryan/high/`).
   Voices this project uses (see the avatar registry in CLAUDE.md):

   | Piper voice           | Path on Hugging Face                    |
   |-----------------------|-----------------------------------------|
   | en_US-ryan-high       | en/en_US/ryan/high/                     |
   | en_US-amy-medium      | en/en_US/amy/medium/                    |
   | en_GB-alan-medium     | en/en_GB/alan/medium/                   |
   | en_US-lessac-medium   | en/en_US/lessac/medium/                 |
   | en_US-libritts_r-medium | en/en_US/libritts_r/medium/ (multi-speaker) |
   | en_US-joe-medium      | en/en_US/joe/medium/                    |

   Put the model files in one directory (e.g. `~/piper-voices/`); the app reads that
   location from `PIPER_VOICES_DIR` (defaults to `~/piper-voices`). Example:

   ```bash
   mkdir -p ~/piper-voices && cd ~/piper-voices
   B=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high
   curl -sL -O "$B/en_US-ryan-high.onnx" && curl -sL -O "$B/en_US-ryan-high.onnx.json"
   ```

**Verify:**

   ```bash
   piper --version
   echo "Hello from Piper." | piper --model ~/piper-voices/en_US-ryan-high.onnx --output_file hello.wav
   ```

   Piper emits 16-bit mono WAV, which Rhubarb accepts directly.

## Supabase (auth + persistence)

1. Create a project at https://supabase.com/dashboard. From **Project Settings → API**
   copy the Project URL and the `anon` key into `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```

   Newer projects show a *publishable* key (`sb_publishable_…`) in the **Connect** dialog
   instead of an anon JWT. Use it under `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the app
   accepts either name.

   (`SUPABASE_SERVICE_ROLE_KEY` is not needed yet; when it is, it stays server-only.)
2. Open **SQL Editor**, paste `supabase/migrations/0001_init.sql`, run it. This creates
   `books`, `reading_progress`, `bookmarks` with owner-only RLS, and a private `books`
   storage bucket where PDFs and extracted page text live under `<user_id>/`.
3. **Authentication → URL Configuration**: Site URL `http://localhost:3000`; add
   `http://localhost:3000/auth/callback` to Redirect URLs (add your production URL too).
4. Email sign-in works out of the box. With "Confirm email" on (default), sign-up sends a
   link that lands on `/auth/callback`. Turn it off under **Authentication → Providers →
   Email** for faster local testing.
5. Google: in Google Cloud Console create an OAuth 2.0 Client ID (Web application) with
   authorised redirect URI `https://<ref>.supabase.co/auth/v1/callback`. Paste the client
   ID/secret into **Authentication → Providers → Google** and enable it.
6. Restart `npm run dev`. `/upload` and `/read/*` now require sign-in; `/login` handles both.
