import { describe, expect, it } from 'vitest';
import { computeMetrics, PAGE } from '../lib/book-metrics';

describe('computeMetrics (mirrors page-flip stretch sizing)', () => {
  it('uses a two-page spread on wide stages and fits the height', () => {
    const m = computeMetrics(1400, 600);
    expect(m.orientation).toBe('landscape');
    expect(m.pageHeight).toBe(600); // height-limited
    expect(m.pageWidth).toBeCloseTo(600 * (PAGE.width / PAGE.height));
    expect(m.blockWidth).toBeCloseTo(m.pageWidth * 2);
  });
  it('is width-limited on a wide but short-of-width stage', () => {
    const m = computeMetrics(900, 2000);
    expect(m.orientation).toBe('landscape');
    expect(m.pageWidth).toBe(450);
    expect(m.pageHeight).toBeCloseTo(600);
  });
  it('switches to a single page below twice the minimum page width', () => {
    const m = computeMetrics(600, 900);
    expect(m.orientation).toBe('portrait');
    expect(m.blockWidth).toBe(600);
    expect(m.pageWidth).toBe(600);
  });
  it('keeps the spread when a height-limited block still clears the threshold', () => {
    // 900x553 fits two 415-wide pages (830 total) — it must not collapse to one page.
    const m = computeMetrics(900, 553);
    expect(m.orientation).toBe('landscape');
    expect(m.blockWidth).toBeGreaterThan(2 * PAGE.minWidth);
    expect(m.pageHeight).toBe(553);
  });
  it('goes portrait when the fitted spread would be too narrow, not when the stage is', () => {
    // Wide but very short: a spread would be under 2*minWidth, so one page is right.
    const m = computeMetrics(900, 180);
    expect(m.orientation).toBe('portrait');
  });
  it('caps page width at maxWidth', () => {
    const m = computeMetrics(4000, 4000);
    expect(m.pageWidth).toBe(PAGE.maxWidth);
  });
});
