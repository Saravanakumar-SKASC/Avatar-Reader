# Avatar Reader — Chrome extension (side-panel wrapper)

A Manifest V3 extension that opens the running Avatar Reader app in Chrome's side panel.
The app itself still runs as a Next.js server; this is a thin window onto it.

## Load it (unpacked)

1. Start the app: `npm run dev` (it must be reachable at `http://localhost:3000`).
2. Chrome → `chrome://extensions` → enable **Developer mode** (top right).
3. **Load unpacked** → choose this `extension/` folder.
4. Pin "Avatar Reader" from the puzzle-piece menu, then click its icon. The side panel opens
   with the app. Drag the panel's edge to make it wider — the reader scales to fit.

## Buttons in the panel

- **↻** reload the app in the panel.
- **⧉** open the current page in its own window. Use this for **Google sign-in** — Google
  refuses to run inside a frame. Email sign-in works directly in the panel.

## Pointing at a deployed app

Edit `APP_URL` in `config.js` and the matching `host_permissions` entry in `manifest.json`,
then reload the extension. `host_permissions` is what makes Chrome treat the framed app as
first-party so its auth cookies work.

## Not supported (by design, for now)

- Running without the Next.js server. TTS (Fish/Piper) and Rhubarb live in `app/api/*`.
