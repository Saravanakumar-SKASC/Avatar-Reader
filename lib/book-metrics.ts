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

const RATIO = PAGE.width / PAGE.height;

function fit(orientation: Orientation, stageW: number, stageH: number): BookMetrics {
  let pageWidth = Math.min(orientation === 'portrait' ? stageW : stageW / 2, PAGE.maxWidth);
  let pageHeight = pageWidth / RATIO;
  if (pageHeight > stageH) {
    pageHeight = stageH;
    pageWidth = pageHeight * RATIO;
  }
  const blockWidth = orientation === 'portrait' ? pageWidth : pageWidth * 2;
  return { orientation, blockWidth, blockHeight: pageHeight, pageWidth, pageHeight };
}

/**
 * Mirror of page-flip's `calculateBoundsRect` for size="stretch" so we can pre-size content.
 * page-flip picks portrait from *its container's* width — the block we hand it — so the choice
 * has to be made on the fitted block width, not the raw stage width. Deciding on the stage
 * instead let a height-limited spread shrink below the threshold and silently drop to one page.
 */
export function computeMetrics(stageW: number, stageH: number): BookMetrics {
  const landscape = fit('landscape', stageW, stageH);
  return landscape.blockWidth < 2 * PAGE.minWidth ? fit('portrait', stageW, stageH) : landscape;
}
