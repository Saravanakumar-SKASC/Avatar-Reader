import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Viseme } from '@/types/tts';
import { activeShapeAt, VRM_MOUTH_SHAPES, type MouthShape } from './lipsync';
import type { FrameDriver } from './useBlink';

const SMOOTHING = 12; // higher = snappier mouth

export interface LipSyncSource {
  visemes: Viseme[];
  /** The element currently playing this viseme track; its currentTime drives the sync. */
  audioRef: RefObject<HTMLAudioElement | null>;
}

export interface LipSyncDriver extends FrameDriver {
  source: LipSyncSource;
}

/**
 * Every frame: find the Rhubarb cue at the audio's currentTime, then ease each VRM vowel
 * weight toward 1 (active shape) or 0. Only a *playing* element drives the mouth.
 */
export function createLipSyncDriver(source: LipSyncSource, apply: (shape: MouthShape, weight: number) => void): LipSyncDriver {
  const weights: Record<string, number> = {};
  const driver: LipSyncDriver = {
    source,
    step(delta) {
      const audio = driver.source.audioRef.current;
      const target =
        audio && !audio.paused && !audio.ended && driver.source.visemes.length
          ? activeShapeAt(driver.source.visemes, audio.currentTime)
          : 'neutral';
      const k = Math.min(delta * SMOOTHING, 1);
      for (const shape of VRM_MOUTH_SHAPES) {
        const current = weights[shape] ?? 0;
        const next = current + ((shape === target ? 1 : 0) - current) * k;
        weights[shape] = next;
        apply(shape, next);
      }
    },
  };
  return driver;
}

/** Hook form (own frame callback) — used by the placeholder figure. */
export function useLipSync(source: LipSyncSource, apply: (shape: MouthShape, weight: number) => void) {
  const driver = useRef<LipSyncDriver | null>(null);
  if (!driver.current) driver.current = createLipSyncDriver(source, apply);
  driver.current.source = source;
  useFrame((_, delta) => driver.current!.step(delta, 0));
}
