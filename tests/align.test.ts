import { describe, expect, it } from 'vitest';
import { alignWords, normalise, wordAtTime } from '../lib/timing/align';

const source = 'Hello, this is a voice test.'.split(' ');

describe('alignWords', () => {
  it('takes Whisper timestamps for matched words', () => {
    const rec = [
      { text: ' Hello,', start: 0.1, end: 0.4 },
      { text: ' this', start: 0.4, end: 0.6 },
      { text: ' is', start: 0.6, end: 0.7 },
      { text: ' a', start: 0.7, end: 0.75 },
      { text: ' voice', start: 0.75, end: 1.1 },
      { text: ' test.', start: 1.1, end: 1.5 },
    ];
    const t = alignWords(source, rec, 1.6);
    expect(t).toHaveLength(6);
    expect(t[0]).toEqual({ start: 0.1, end: 0.4 });
    expect(t[4]).toEqual({ start: 0.75, end: 1.1 });
  });
  it('interpolates words Whisper missed or misheard, keeping order', () => {
    const rec = [
      { text: ' Hello', start: 0.1, end: 0.4 },
      { text: ' voice', start: 0.9, end: 1.2 },
      { text: ' test', start: 1.2, end: 1.5 },
    ];
    const t = alignWords(source, rec, 1.6);
    expect(t[0]).toEqual({ start: 0.1, end: 0.4 });
    // "this is a" fill the gap 0.4 → 0.9 in order
    expect(t[1].start).toBeCloseTo(0.4);
    expect(t[3].end).toBeCloseTo(0.9);
    expect(t[1].end).toBeLessThanOrEqual(t[2].start + 1e-9);
    expect(t[4]).toEqual({ start: 0.9, end: 1.2 });
    for (let i = 1; i < t.length; i++) expect(t[i].start).toBeGreaterThanOrEqual(t[i - 1].end - 1e-9);
  });
  it('spreads everything over the clip when nothing was recognised', () => {
    const t = alignWords(source, [], 3);
    expect(t[0].start).toBe(0);
    expect(t[t.length - 1].end).toBeCloseTo(3);
  });
  it('normalises punctuation and case', () => {
    expect(normalise(' Hello,')).toBe('hello');
    expect(normalise('“Quoted!”')).toBe('quoted');
  });
});

describe('wordAtTime', () => {
  const words = [
    { start: 0, end: 0.5 },
    { start: 0.5, end: 1 },
    { start: 1.2, end: 2 },
  ];
  it('finds the word whose window contains t, and the next one during silence', () => {
    expect(wordAtTime(words, 0.1)).toBe(0);
    expect(wordAtTime(words, 0.5)).toBe(1);
    expect(wordAtTime(words, 1.1)).toBe(2);
    expect(wordAtTime(words, 5)).toBe(2);
    expect(wordAtTime([], 1)).toBe(-1);
  });
});
