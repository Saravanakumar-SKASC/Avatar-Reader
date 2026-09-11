# Richer facial expressions, eyebrows and lip-sync — research + plan

_Findings from inspecting the shipped VRoid models (2026-09-10)._

## What the models can already do (no new assets needed)

Each `.vrm` is a VRoid export with **57 face morph targets**, grouped by region:

| Region | Morph targets |
|---|---|
| Whole face (what VRM presets use) | `Fcl_ALL_Angry / Fun / Joy / Neutral / Sorrow / Surprised` |
| **Eyebrows only** | `Fcl_BRW_Angry / Fun / Joy / Sorrow / Surprised` |
| **Eyes only** | `Fcl_EYE_Angry / Close / Close_L / Close_R / Fun / Joy / Joy_L / Joy_R / Natural / Sorrow / Spread / Surprised / Iris_Hide / Highlight_Hide` |
| **Mouth only** | `Fcl_MTH_A / I / U / E / O / Angry / Close / Down / Fun / Joy / Large / Neutral / Small / Sorrow / Surprised / Up / SkinFung(_L/_R)` |
| Teeth/fangs | `Fcl_HA_*` |

But the VRM **expression layer binds exactly one morph per preset**: `happy` = `Fcl_ALL_Joy`,
`angry` = `Fcl_ALL_Angry`, … and `aa/ih/ou/ee/oh` = `Fcl_MTH_A/I/U/E/O`. There are no custom
expressions and no override flags. So today we can only flip the *whole* face between five moods.

## Plan A — compose expressions from regions (recommended, free, ~2 days)

three-vrm lets us register expressions at runtime:

```ts
import { VRMExpression, VRMExpressionMorphTargetBind } from '@pixiv/three-vrm';
const e = new VRMExpression('browRaise');
for (const prim of primitivesWithMorph('Fcl_BRW_Surprised'))
  e.addBind(new VRMExpressionMorphTargetBind({ primitives: [prim], index: idx, weight: 1 }));
vrm.expressionManager.registerExpression(e);
```

Registering one expression per **region morph** (≈25 of them) turns the face into a
mixing desk. Emotions become *recipes* of region weights instead of single presets:

| Emotion | Brows | Eyes | Mouth |
|---|---|---|---|
| joy | BRW_Joy 0.6 | EYE_Joy 0.5 | MTH_Joy 0.4 |
| amused / smirk | BRW_Fun 0.4 | EYE_Fun 0.4 | MTH_Fun 0.5 |
| tender / caring | BRW_Joy 0.3 | EYE_Natural 0.4 | MTH_Up 0.2 |
| thoughtful | BRW_Sorrow 0.35 | EYE_Natural 0.3 | MTH_Small 0.2 |
| worried / nervous | BRW_Sorrow 0.6 | EYE_Surprised 0.3 | MTH_Down 0.3 |
| sad | BRW_Sorrow 0.7 | EYE_Sorrow 0.6 | MTH_Sorrow 0.4 |
| annoyed | BRW_Angry 0.5 | EYE_Angry 0.3 | MTH_Angry 0.2 |
| angry | BRW_Angry 0.8 | EYE_Angry 0.7 | MTH_Angry 0.5 |
| surprised | BRW_Surprised 0.8 | EYE_Surprised 0.8 | MTH_Surprised 0.5 |
| curious | BRW_Surprised 0.4 (one side via L/R eye bias) | EYE_Spread 0.3 | — |
| disgust | BRW_Angry 0.4 | EYE_Close 0.25 | MTH_Down 0.5 |
| fear | BRW_Sorrow 0.5 + BRW_Surprised 0.5 | EYE_Surprised 0.9 | MTH_Small 0.4 |
| bored / sleepy | — | EYE_Close 0.35 | MTH_Neutral |
| wink / playful | BRW_Fun 0.3 | EYE_Close_L 1.0 | MTH_Fun 0.4 |

Work items:
1. `lib/emotion/recipes.ts` — the table above; `lib/emotion/types.ts` grows from 5 to ~14 emotions.
2. `components/avatar/face-rig.ts` — registers region expressions on load (skip gracefully on
   non-VRoid models that lack `Fcl_*`; fall back to the five presets).
3. `useEmotion` drives *region* weights (three lerp channels: brows fast ≈ 8, eyes ≈ 6, mouth
   ≈ 4) instead of one preset — brows lead, mouth follows, which is how real faces move.
4. Classifier mapping: GoEmotions' 28 labels already distinguish amusement / curiosity /
   nervousness / disgust / caring / annoyance → map them to the new recipes (currently they
   collapse to 5). No new model needed. An OpenAI key would raise accuracy on subtle prose
   (irony, understatement) — optional, the local path stays default.
5. **Eyebrow-driven prosody**: raise brows on emphasised words (Whisper gives word timing;
   loudness peaks from the WAV give emphasis) and on questions (sentence ends with `?`) —
   a brow flick of ~0.25 for 300 ms. Cheap and very "alive".
6. **Eye micro-behaviour**: eye-only `EYE_Joy_L/R` for asymmetric smiles; `EYE_Spread`
   (widen) on surprise words; slower blink rate while reading, faster when idle/curious.

## Plan B — better lip-sync (free, ~1 day)

Current: Rhubarb `phonetic` → 5 vowel presets, each a single morph, eased at 12/s.

1. **Consonant shapes.** Rhubarb `B` (M/B/P) is currently mapped to `ih` — wrong. Map
   `B → Fcl_MTH_Close` (lips pressed), `F → Fcl_MTH_U` + `Fcl_HA_Short_Up` (teeth on lip),
   `G → Fcl_MTH_Small` (F/V shape), `H → Fcl_MTH_Large`. Needs Plan A's region expressions.
2. **Jaw/lip co-articulation.** Blend the *next* cue in during the last 30 % of the current
   one (look-ahead in `activeShapeAt`), instead of a single target per frame.
3. **Loudness → openness.** Scale mouth weight by the WAV's RMS envelope (compute server-side
   with the WAV decoder already in `lib/timing/wav-decode.ts`, ship as a 20 Hz array); quiet
   syllables open less.
4. **Accuracy:** `RHUBARB_RECOGNIZER=pocketSphinx` with the dialog file (already wired) gives
   phoneme-accurate cues; ~2–3× slower than `phonetic`, still cached per clip.
5. Cap: total mouth-region weight ≤ 1 so emotion mouth shapes and visemes never sum past the
   morph's range (visible "over-stretch" today when `happy` + `aa` coincide).

## Plan C — beyond blend shapes (later)

- **Head/neck accents on speech**: nod on sentence ends, lean-in on questions (bones, via the
  existing motion driver — the rest-pose-relative system makes this safe).
- **Audio-driven micro-motion**: map the loudness envelope to tiny head pitch (speakers move
  on stressed syllables).
- **Per-avatar personality**: gesture frequency, blink rate, gaze wander radius and recipe
  intensity multipliers in `lib/avatars.ts` (Zara animated, Professor restrained).
- **Room tone / ambience** for immersion: optional bed track by book genre (Web Audio,
  independent gain from the new volume control).

## What I need from you

- **Nothing for Plans A and B** — both are free and local.
- **OpenAI key (optional)** only if you want the higher-accuracy emotion path.
- **Approval of the emotion list** above before I wire the classifier to it.
