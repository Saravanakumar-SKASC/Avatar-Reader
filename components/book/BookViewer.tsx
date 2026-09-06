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
  word: number;
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
 * One page. Memoised so re-renders caused by the moving highlight only touch the page
 * that is actually being read. react-pageflip attaches a ref to each child, hence forwardRef.
 */
const BookPage = memo(
  forwardRef<HTMLDivElement, { text: string; index: number; total: number; activeWord: number | null }>(
    function BookPage({ text, index, total, activeWord }, ref) {
      const words = useMemo(() => tokenizeWords(text), [text]);
      const activeRef = useRef<HTMLSpanElement>(null);

      // Keep the spoken word in view on long pages.
      useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
      }, [activeWord]);

      return (
        <div ref={ref} className="page relative overflow-hidden bg-[#f5efe3] p-8 shadow-inner">
          <p className="font-serif leading-relaxed text-gray-900">
            {words.length === 0
              ? '(no text on this page)'
              : words.map((w, i) => (
                  <span
                    key={i}
                    ref={i === activeWord ? activeRef : undefined}
                    className={
                      i === activeWord
                        ? 'rounded bg-amber-300/80 px-0.5 -mx-0.5 transition-colors duration-150'
                        : undefined
                    }
                  >
                    {w}{' '}
                  </span>
                ))}
          </p>
          <span className="absolute bottom-4 right-6 text-xs text-gray-400">
            {index + 1} / {total}
          </span>
        </div>
      );
    }
  )
);

export default function BookViewer({ pages, currentPage, onFlip, highlight, orientation = 'landscape' }: BookViewerProps) {
  const bookRef = useRef<FlipBookHandle | null>(null);

  useEffect(() => {
    const api = bookRef.current?.pageFlip();
    if (api && api.getCurrentPageIndex() !== currentPage) {
      api.flip(currentPage);
    }
  }, [currentPage]);

  return (
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
        <BookPage
          key={i}
          text={text}
          index={i}
          total={pages.length}
          activeWord={highlight && highlight.page === i ? highlight.word : null}
        />
      ))}
    </HTMLFlipBook>
  );
}
