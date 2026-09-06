import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const MIN_INTERVAL = 2;
const MAX_INTERVAL = 6;
const BLINK_DURATION = 0.2; // seconds, close + open

function nextInterval() {
  return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
}

/**
 * Drives a 0..1 blink weight on the render loop. Each call gets independent
 * timing. A new blink can only be scheduled once the current one has fully
 * finished, so overlapping blinks are impossible by construction.
 */
export function useBlink(apply: (weight: number) => void) {
  const state = useRef({ nextAt: nextInterval(), blinkStart: -1 });

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const s = state.current;

    if (s.blinkStart < 0) {
      // idle: eyes open until it's time to blink
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
    // smooth close then open
    apply(Math.sin(progress * Math.PI));
  });
}
