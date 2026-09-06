import { describe, expect, it } from 'vitest';
import { paginate, type PageBox } from '../lib/paginate';

// Deterministic box for Node (no canvas): 7.4 px/char estimate.
const box: PageBox = { width: 74, height: 48, font: 'x', lineHeight: 24 }; // 10 chars/line, 2 lines/page

describe('paginate', () => {
  it('keeps every word once and in order', () => {
    const text = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
    const pages = paginate([text], box);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map((p) => p.text).join(' ')).toBe(text);
    expect(pages.every((p) => p.source === 0)).toBe(true);
  });
  it('never exceeds the line budget', () => {
    const text = Array.from({ length: 40 }, () => 'abc').join(' '); // "abc abc" = 7 chars → 2 words/line
    for (const p of paginate([text], box)) expect(p.text.split(' ').length).toBeLessThanOrEqual(4);
  });
  it('flows text across PDF pages so pages are full, skipping empty ones', () => {
    const pages = paginate(['one two', '', 'three'], box);
    expect(pages).toEqual([{ text: 'one two three', source: 0 }]);
  });
  it('records the PDF page the first word came from', () => {
    // 3-char words: 2 per line, 2 lines → 4 words per page
    const pages = paginate([Array(12).fill('abc').join(' '), Array(4).fill('xyz').join(' ')], box);
    expect(pages.map((p) => p.source)).toEqual([0, 0, 0, 1]);
    expect(pages[3].text).toBe('xyz xyz xyz xyz');
  });
});
