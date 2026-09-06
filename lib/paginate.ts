/**
 * Re-flows extracted PDF text into book pages that fit the flip-book's fixed page box,
 * so nothing is clipped. Text flows continuously across PDF page boundaries so every
 * book page is full (a PDF page break is not a book page break). Uses canvas text
 * measurement in the browser (same font string as the page CSS) and a character
 * estimate elsewhere.
 */

export interface BookPage {
  text: string;
  /** 0-based index of the PDF page the first word came from. */
  source: number;
}

export interface PageBox {
  /** Usable text width/height in CSS px (page size minus padding/footer). */
  width: number;
  height: number;
  /** Must match the page's CSS exactly, e.g. "15px Georgia, 'Times New Roman', serif". */
  font: string;
  lineHeight: number;
}

/** Defaults matching BookPage's CSS in components/book/BookViewer.tsx. */
export const PAGE_BOX: PageBox = {
  width: 480 - 2 * 36,
  height: 640 - 2 * 36 - 28,
  font: "15px Georgia, 'Times New Roman', serif",
  lineHeight: 24,
};

type Measure = (s: string) => number;

function makeMeasure(box: PageBox): Measure {
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = box.font;
      return (s) => ctx.measureText(s).width;
    }
  }
  return (s) => s.length * 7.4; // ~Georgia 15px average glyph width
}

/** Greedy word wrap → number of words that fit on one page. */
function wordsPerPage(words: string[], start: number, box: PageBox, measure: Measure): number {
  const maxLines = Math.max(1, Math.floor(box.height / box.lineHeight));
  const spaceW = measure(' ');
  let lines = 1;
  let lineW = 0;
  let i = start;
  for (; i < words.length; i++) {
    const w = measure(words[i]);
    const needed = lineW === 0 ? w : lineW + spaceW + w;
    if (needed <= box.width) {
      lineW = needed;
      continue;
    }
    // wrap
    if (lines === maxLines) break;
    lines++;
    lineW = w > box.width ? box.width : w; // an over-long word gets its own (clipped) line
  }
  return Math.max(1, i - start);
}

export function paginate(pdfPages: string[], box: PageBox = PAGE_BOX): BookPage[] {
  const measure = makeMeasure(box);
  // One continuous word stream, remembering which PDF page each word came from.
  const words: string[] = [];
  const sources: number[] = [];
  pdfPages.forEach((text, source) => {
    for (const w of text.split(/\s+/)) {
      if (w) {
        words.push(w);
        sources.push(source);
      }
    }
  });
  const out: BookPage[] = [];
  let start = 0;
  while (start < words.length) {
    const n = wordsPerPage(words, start, box, measure);
    out.push({ text: words.slice(start, start + n).join(' '), source: sources[start] });
    start += n;
  }
  return out;
}
