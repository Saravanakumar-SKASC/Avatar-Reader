import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { EMOTIONS, type Emotion, type EmotionCue } from '@/lib/emotion/types';
import { emotionAt } from '@/lib/emotion/timeline';
import type { FrameDriver } from './useBlink';

/** Expressions never exceed this so they layer under the mouth shapes instead of fighting them. */
export const EMOTION_MAX_WEIGHT = 0.6;
/** Slower than the mouth (12): expressions should hold across a sentence, not flicker per syllable. */
const SMOOTHING = 4;

export type EmotionName = Exclude<Emotion, 'neutral'>;

export interface EmotionSource {
  /** Cues for the clip currently in `audioRef`, in fractions of its duration. */
  cues: EmotionCue[];
  audioRef: RefObject<HTMLAudioElement | null>;
}

export interface EmotionDriver extends FrameDriver {
  source: EmotionSource;
  /** Current smoothed weights (read after `step`). */
  weights: Record<EmotionName, number>;
}

/**
 * Pick the emotion cue at the audio's current position and ease the five VRM emotion
 * weights toward it (capped at 0.6). Paused / ended / no audio → everything eases to 0.
 */
export function createEmotionDriver(source: EmotionSource): EmotionDriver {
  const weights = { happy: 0, angry: 0, sad: 0, relaxed: 0, surprised: 0 };
  const driver: EmotionDriver = {
    source,
    weights,
    step(delta) {
      const audio = driver.source.audioRef.current;
      let target: Emotion = 'neutral';
      let strength = 0;
      if (audio && !audio.paused && !audio.ended && audio.duration > 0 && driver.source.cues.length) {
        const cue = emotionAt(driver.source.cues, audio.currentTime / audio.duration);
        if (cue && cue.emotion !== 'neutral') {
          target = cue.emotion;
          strength = Math.min(EMOTION_MAX_WEIGHT, cue.score * EMOTION_MAX_WEIGHT + 0.2);
        }
      }
      const k = Math.min(delta * SMOOTHING, 1);
      for (const e of EMOTIONS) {
        weights[e] = weights[e] + ((e === target ? strength : 0) - weights[e]) * k;
      }
    },
  };
  return driver;
}

/** Hook form (own frame callback) — used by the placeholder figure. */
export function useEmotion(source: EmotionSource, apply: (emotion: EmotionName, weight: number) => void) {
  const driver = useRef<EmotionDriver | null>(null);
  if (!driver.current) driver.current = createEmotionDriver(source);
  driver.current.source = source;
  useFrame((_, delta) => {
    const d = driver.current!;
    d.step(delta, 0);
    for (const e of EMOTIONS) apply(e, d.weights[e]);
  });
}
