import { describe, expect, it } from 'vitest';
import { splitIntoChunks, tokenizeWords, wordAtFraction, wordFractions } from '../lib/tts/chunk';

const para =
  'The lamp was older than the town. It had been shipped over in pieces, bolted together by men whose names were now only scratches on the brass. ' +
  'Ada polished the lens each morning with a cloth her mother had used, and each morning the glass gave back her face, stretched and curious. ' +
  'Winter arrived with the patience of something that knows it will be staying.';

describe('splitIntoChunks', () => {
  it('covers every word exactly once, in order', () => {
    const chunks = splitIntoChunks(para, 120);
    const words = tokenizeWords(para);
    expect(chunks.length).toBeGreaterThan(1);
    let expectedStart = 0;
    for (const c of chunks) {
      expect(c.startWord).toBe(expectedStart);
      expect(c.wordCount).toBe(tokenizeWords(c.text).length);
      expectedStart += c.wordCount;
    }
    expect(expectedStart).toBe(words.length);
    expect(chunks.map((c) => c.text).join(' ')).toBe(words.join(' '));
  });
  it('prefers sentence boundaries', () => {
    const chunks = splitIntoChunks(para, 120);
    for (const c of chunks.slice(0, -1)) expect(c.text).toMatch(/[.!?]$/);
  });
  it('keeps the first chunk short so playback starts sooner', () => {
    // target = minimum length before cutting at the next sentence end
    const chunks = splitIntoChunks(para, 240, 20);
    expect(chunks[0].text).toBe('The lamp was older than the town.');
    expect(chunks[0].text.length).toBeLessThan(chunks[1].text.length);
  });
  it('returns nothing for blank text', () => {
    expect(splitIntoChunks('   \n ')).toEqual([]);
  });
});

describe('word timing', () => {
  it('fractions are increasing and end at 1', () => {
    const f = wordFractions(['a', 'longer', 'word.']);
    expect(f[0]).toBeLessThan(f[1]);
    expect(f[1]).toBeLessThan(f[2]);
    expect(f[2]).toBeCloseTo(1);
  });
  it('maps a fraction to the word being spoken', () => {
    const f = [0.25, 0.5, 0.75, 1];
    expect(wordAtFraction(f, 0)).toBe(0);
    expect(wordAtFraction(f, 0.3)).toBe(1);
    expect(wordAtFraction(f, 0.99)).toBe(3);
    expect(wordAtFraction(f, 1.5)).toBe(3);
  });
});
