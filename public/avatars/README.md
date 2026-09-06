# Avatar assets

Drop files here; the app picks them up automatically, no code change needed.

- `<id>.vrm` — the 3D model for an avatar (`alex.vrm`, `luna.vrm`, …). Ids are in
  `lib/avatars.ts`. Until a file exists, the app renders a placeholder figure.
- `<id>.png` — optional picker thumbnail (square). Falls back to an initial badge.

VRM 0.x and 1.0 are both supported. The model needs a `blink` expression (standard in
VRM) for eye blinking to work. Free models: https://hub.vroid.com (check each licence).
