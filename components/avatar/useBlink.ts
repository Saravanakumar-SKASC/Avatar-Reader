import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const MIN_INTERVAL = 2;
const MAX_INTERVAL = 6;
const BLINK_DURATION = 0.2; // seconds, close + open

function nextInterval() {
  return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
}

export interface FrameDriver {
  /** Advance by `delta` seconds at absolute time `t`. */
  step(delta: number, t: number): void;
}

/**
 * Blink weight (0..1) state machine. A new blink can only be scheduled once the current
 * one has fully finished, so overlapping blinks are impossible by construction.
 */
export function createBlinkDriver(apply: (weight: number) => void): FrameDriver {
  const s = { nextAt: nextInterval(), blinkStart: -1 };
  return {
    step(_delta, t) {
      if (s.blinkStart < 0) {
        if (t >= s.nextAt) s.blinkStart = t;
        else return;
      }
      const progress = (t - s.blinkStart) / BLINK_DURATION;
      if (progress >= 1) {
        apply(0);
        s.blinkStart = -1;
        s.nextAt = t + nextInterval();
        return;
      }
      apply(Math.sin(progress * Math.PI)); // smooth close then open
    },
  };
}

/** Hook form (own frame callback) — used by the placeholder figure. */
export function useBlink(apply: (weight: number) => void) {
  const driver = useRef<FrameDriver | null>(null);
  if (!driver.current) driver.current = createBlinkDriver(apply);
  useFrame(({ clock }, delta) => driver.current!.step(delta, clock.getElapsedTime()));
}
