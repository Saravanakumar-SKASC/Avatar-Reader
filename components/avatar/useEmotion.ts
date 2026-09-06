import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { EMOTIONS, type Emotion, type EmotionCue } from '@/lib/emotion/types';
import { emotionAt } from '@/lib/emotion/timeline';

/** Expressions never exceed this so they layer under the mouth shapes instead of fighting them. */
export const EMOTION_MAX_WEIGHT = 0.6;
/** Slower than the mouth (12): expressions should hold across a sentence, not flicker per syllable. */
const SMOOTHING = 4;

export interface EmotionSource {
  /** Cues for the clip currently in `audioRef`, in fractions of its duration. */
  cues: EmotionCue[];
  audioRef: RefObject<HTMLAudioElement | null>;
}

/**
 * Same driving loop as lip-sync/blink, one more layer: pick the emotion cue at the audio's
 * current position and ease the five VRM emotion weights toward it (capped at 0.6).
 * Paused / ended / no audio → everything eases back to 0.
 */
export function useEmotion(source: EmotionSource, apply: (emotion: Exclude<Emotion, 'neutral'>, weight: number) => void) {
  const weights = useRef<Record<string, number>>({});

  useFrame((_, delta) => {
    const audio = source.audioRef.current;
    let target: Emotion = 'neutral';
    let strength = 0;
    if (audio && !audio.paused && !audio.ended && audio.duration > 0 && source.cues.length) {
      const cue = emotionAt(source.cues, audio.currentTime / audio.duration);
      if (cue && cue.emotion !== 'neutral') {
        target = cue.emotion;
        strength = Math.min(EMOTION_MAX_WEIGHT, cue.score * EMOTION_MAX_WEIGHT + 0.2);
      }
    }
    const k = Math.min(delta * SMOOTHING, 1);
    for (const e of EMOTIONS) {
      const current = weights.current[e] ?? 0;
      const next = current + ((e === target ? strength : 0) - current) * k;
      weights.current[e] = next;
      apply(e, next);
    }
  });
}
