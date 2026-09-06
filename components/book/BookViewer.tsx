'use client';

import HTMLFlipBook from 'react-pageflip';
import { forwardRef, memo, useEffect, useMemo, useRef } from 'react';
import { tokenizeWords } from '@/lib/tts/chunk';

// page-flip ships no type declarations; this covers the methods we call.
interface PageFlipApi {
  flip(page: number): void;
  getCurrentPageIndex(): number;
}
interface FlipBookHandle {
  pageFlip(): PageFlipApi | undefined;
}

export interface WordHighlight {
  page: number;
  /** Word being spoken right now. */
  word: number;
  /** Words of the phrase (TTS chunk) currently being read: [from, to). */
  from: number;
  to: number;
}

interface BookViewerProps {
  pages: string[];
  currentPage: number;
  /** Fired when the user flips by drag/click, so the parent can stay in sync. */
  onFlip?: (page: number) => void;
  /** Word currently being read aloud, if any. */
  highlight?: WordHighlight | null;
  /** 'portrait' shows one page (narrow screens); 'landscape' shows a spread. */
  orientation?: 'portrait' | 'landscape';
}

/**
 * One page. Static content: react-pageflip keeps its own copy of these elements and (with
 * `renderOnlyPageLengthChange`) never re-renders them, so the highlight is applied to the
 * DOM imperatively via the data attributes below — see the effect in BookViewer.
 * react-pageflip attaches a ref to each child, hence forwardRef.
 */
const BookPage = memo(
  forwardRef<HTMLDivElement, { text: string; index: number; total: number }>(function BookPage(
    { text, index, total },
    ref
  ) {
    const words = useMemo(() => tokenizeWords(text), [text]);
    return (
      <div
        ref={ref}
        data-page={index}
        className="page relative overflow-hidden bg-[#f6f0e4] text-gray-900 shadow-inner"
        style={{ padding: 36 }}
      >
        {/* Font/line-height MUST match lib/paginate PAGE_BOX so text never overflows. */}
        <p style={{ font: "15px Georgia, 'Times New Roman', serif", lineHeight: '24px', margin: 0 }}>
          {words.length === 0
            ? '(no text on this page)'
            : words.map((w, i) => (
                <span key={i} data-w={i} className="read-word">
                  {w}{' '}
                </span>
              ))}
        </p>
        <span className="absolute bottom-3 right-5 text-xs text-gray-400" style={{ font: '11px Georgia, serif' }}>
          {index + 1} / {total}
        </span>
      </div>
    );
  })
);

export default function BookViewer({ pages, currentPage, onFlip, highlight, orientation = 'landscape' }: BookViewerProps) {
  const bookRef = useRef<FlipBookHandle | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const marked = useRef<Element[]>([]);

  // Apply the highlight straight to the DOM (page-flip may also clone a page mid-flip; both
  // copies get the classes because we query every matching node).
  useEffect(() => {
    for (const el of marked.current) el.classList.remove('read-word--phrase', 'read-word--now');
    marked.current = [];
    const root = wrapRef.current;
    if (!root || !highlight) return;
    const pageEls = root.querySelectorAll<HTMLElement>(`[data-page="${highlight.page}"]`);
    pageEls.forEach((pageEl) => {
      for (let w = highlight.from; w < highlight.to; w++) {
        const el = pageEl.querySelector(`[data-w="${w}"]`);
        if (!el) continue;
        el.classList.add('read-word--phrase');
        marked.current.push(el);
      }
      const now = pageEl.querySelector(`[data-w="${highlight.word}"]`);
      if (now) {
        now.classList.add('read-word--now');
        marked.current.push(now);
      }
    });
  }, [highlight]);

  useEffect(() => {
    const api = bookRef.current?.pageFlip();
    if (api && api.getCurrentPageIndex() !== currentPage) {
      api.flip(currentPage);
    }
  }, [currentPage]);

  return (
    <div ref={wrapRef}>
    <HTMLFlipBook
      key={orientation} // page-flip picks orientation from its container width at init
      ref={bookRef}
      width={480}
      height={640}
      size="fixed"
      minWidth={480}
      maxWidth={480}
      minHeight={640}
      maxHeight={640}
      startPage={currentPage}
      showCover
      drawShadow
      flippingTime={800}
      usePortrait
      startZIndex={0}
      autoSize
      maxShadowOpacity={0.5}
      mobileScrollSupport
      clickEventForward
      useMouseEvents
      swipeDistance={30}
      showPageCorners
      disableFlipByClick={false}
      renderOnlyPageLengthChange // don't re-init page-flip when only text/highlight changes
      className=""
      style={{}}
      onFlip={(e: { data: number }) => onFlip?.(e.data)}
    >
      {pages.map((text, i) => (
        <BookPage key={i} text={text} index={i} total={pages.length} />
      ))}
    </HTMLFlipBook>
    </div>
  );
}
