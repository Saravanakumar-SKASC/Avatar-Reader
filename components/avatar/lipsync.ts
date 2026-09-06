import type { Viseme } from '@/types/tts';

/** VRM vowel expression presets driven by lip-sync (VRM 0.x A/I/U/E/O are normalised to these by three-vrm). */
export const VRM_MOUTH_SHAPES = ['aa', 'ih', 'ou', 'ee', 'oh'] as const;
export type MouthShape = (typeof VRM_MOUTH_SHAPES)[number] | 'neutral';

/** Rhubarb (Preston Blair) mouth cues -> VRM vowel presets. */
export const RHUBARB_TO_VRM: Record<string, MouthShape> = {
  X: 'neutral', A: 'neutral',
  B: 'ih', G: 'ih',
  C: 'ee',
  D: 'aa', H: 'aa',
  E: 'oh',
  F: 'ou',
};

/** Rhubarb cues are [start, end) ranges in seconds. Returns the VRM shape active at `t`. */
export function activeShapeAt(visemes: Viseme[], t: number): MouthShape {
  const active = visemes.find((v) => t >= v.start && t < v.end);
  return active ? RHUBARB_TO_VRM[active.value] ?? 'neutral' : 'neutral';
}

/** How far the jaw opens for each shape (0..1) — used by the placeholder's box mouth. */
export const MOUTH_OPENNESS: Record<MouthShape, number> = {
  neutral: 0, aa: 1, oh: 0.8, ou: 0.5, ee: 0.35, ih: 0.3,
};
