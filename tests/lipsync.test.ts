import { describe, expect, it } from 'vitest';
import { activeShapeAt, RHUBARB_TO_VRM, VRM_MOUTH_SHAPES } from '../components/avatar/lipsync';

const cues = [
  { start: 0.0, end: 0.1, value: 'X' },
  { start: 0.1, end: 0.3, value: 'D' },
  { start: 0.3, end: 0.5, value: 'F' },
];

describe('activeShapeAt', () => {
  it('maps the cue whose [start, end) range contains t', () => {
    expect(activeShapeAt(cues, 0.05)).toBe('neutral');
    expect(activeShapeAt(cues, 0.1)).toBe('aa'); // inclusive start
    expect(activeShapeAt(cues, 0.29)).toBe('aa');
    expect(activeShapeAt(cues, 0.3)).toBe('ou'); // exclusive end of previous
  });
  it('is neutral outside every cue or for unknown letters', () => {
    expect(activeShapeAt(cues, 0.9)).toBe('neutral');
    expect(activeShapeAt([{ start: 0, end: 1, value: 'Z' }], 0.5)).toBe('neutral');
  });
  it('maps every Rhubarb letter A–H and X to a VRM shape', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']) {
      const shape = RHUBARB_TO_VRM[letter];
      expect(shape === 'neutral' || (VRM_MOUTH_SHAPES as readonly string[]).includes(shape)).toBe(true);
    }
  });
});
