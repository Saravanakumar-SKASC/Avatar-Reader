import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Viseme } from '@/types/tts';
import { activeShapeAt, VRM_MOUTH_SHAPES, type MouthShape } from './lipsync';

const SMOOTHING = 12; // higher = snappier mouth

export interface LipSyncSource {
  visemes: Viseme[];
  /** The element currently playing this viseme track; its currentTime drives the sync. */
  audioRef: RefObject<HTMLAudioElement | null>;
}

/**
 * Every frame: find the Rhubarb cue at the audio's currentTime, then ease each VRM
 * vowel weight toward 1 (active shape) or 0. `apply` receives the smoothed weight for
 * each shape, so any avatar (VRM expression, placeholder mesh…) can consume it.
 */
export function useLipSync(source: LipSyncSource, apply: (shape: MouthShape, weight: number) => void) {
  const weights = useRef<Record<string, number>>({});

  useFrame((_, delta) => {
    const audio = source.audioRef.current;
    // Only a *playing* element drives the mouth. Paused, ended, or missing => rest position.
    const target =
      audio && !audio.paused && !audio.ended && source.visemes.length
        ? activeShapeAt(source.visemes, audio.currentTime)
        : 'neutral';
    const k = Math.min(delta * SMOOTHING, 1);

    for (const shape of VRM_MOUTH_SHAPES) {
      const current = weights.current[shape] ?? 0;
      const next = current + ((shape === target ? 1 : 0) - current) * k;
      weights.current[shape] = next;
      apply(shape, next);
    }
  });
}
