import { describe, expect, it } from 'vitest';
import { AVATARS, withEmotionTag } from '../lib/avatars';

describe('withEmotionTag', () => {
  it('prepends the inline tag with a single space', () => {
    expect(withEmotionTag('[excited]', 'Once upon a time')).toBe('[excited] Once upon a time');
  });
  it('returns the text unchanged when there is no tag', () => {
    expect(withEmotionTag('', 'Once upon a time')).toBe('Once upon a time');
    expect(withEmotionTag('  ', 'Once upon a time')).toBe('Once upon a time');
  });
});

describe('AVATARS registry', () => {
  it('has 7 unique ids and a Piper voice for each', () => {
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(7);
    for (const a of AVATARS) expect(a.piperVoice).toMatch(/^en_(US|GB)-/);
  });
});
