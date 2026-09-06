export type Orientation = 'portrait' | 'landscape';

/** Base page geometry. Page content is laid out at this size and scaled to the real page. */
export const PAGE = { width: 480, height: 640, minWidth: 320, maxWidth: 760 };

export interface BookMetrics {
  orientation: Orientation;
  /** Width/height the flip-book container should get. */
  blockWidth: number;
  blockHeight: number;
  /** Real rendered page width / height, as page-flip will compute them in stretch mode. */
  pageWidth: number;
  pageHeight: number;
}

/** Mirror of page-flip's `calculateBoundsRect` for size="stretch" so we can pre-size content. */
export function computeMetrics(stageW: number, stageH: number): BookMetrics {
  const ratio = PAGE.width / PAGE.height;
  const orientation: Orientation = stageW < 2 * PAGE.minWidth ? 'portrait' : 'landscape';
  let pageWidth = orientation === 'portrait' ? stageW : stageW / 2;
  pageWidth = Math.min(pageWidth, PAGE.maxWidth);
  let pageHeight = pageWidth / ratio;
  if (pageHeight > stageH) {
    pageHeight = stageH;
    pageWidth = pageHeight * ratio;
  }
  const blockWidth = orientation === 'portrait' ? pageWidth : pageWidth * 2;
  return { orientation, blockWidth, blockHeight: pageHeight, pageWidth, pageHeight };
}
