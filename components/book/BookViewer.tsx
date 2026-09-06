'use client';

import HTMLFlipBook from 'react-pageflip';
import { forwardRef, memo, useEffect, useMemo, useRef } from 'react';
import { tokenizeWords } from '@/lib/tts/chunk';
import { PAGE, type BookMetrics } from './BookFrame';

// page-flip ships no type declarations; this covers the methods we call.
interface PageFlipApi {
  flip(page: number): void;
  getCurrentPageIndex(): number;
  update(): void;
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
  /** Text page index (0-based). The cover sits in front of it in the flip order. */
  currentPage: number;
  onFlip?: (page: number) => void;
  highlight?: WordHighlight | null;
  metrics: BookMetrics;
  title: string;
  author?: string | null;
  /** Open on the cover instead of `currentPage` (first visit of a book). */
  startOnCover?: boolean;
}

/** Shared frame for every leaf: page-flip sizes the outer div; the inner layer is a fixed 480×640 canvas scaled to it. */
const Leaf = forwardRef<HTMLDivElement, { className?: string; density?: 'hard' | 'soft'; children: React.ReactNode; index?: number }>(
  function Leaf({ className, density = 'soft', children, index }, ref) {
    return (
      <div ref={ref} className={`leaf ${className ?? ''}`} data-density={density} data-page={index}>
        <div className="leaf__content" style={{ width: PAGE.width, height: PAGE.height }}>
          {children}
        </div>
      </div>
    );
  }
);

const CoverPage = forwardRef<HTMLDivElement, { title: string; author?: string | null }>(function CoverPage(
  { title, author },
  ref
) {
  return (
    <Leaf ref={ref} className="leaf--cover" density="hard">
      <div className="cover">
        <div className="cover__frame">
          <div className="cover__ornament">❦</div>
          <h2 className="cover__title">{title}</h2>
          {author && <p className="cover__author">{author}</p>}
          <div className="cover__rule" />
          <p className="cover__imprint">Avatar Reader</p>
        </div>
      </div>
    </Leaf>
  );
});

const BackCoverPage = forwardRef<HTMLDivElement, { title: string }>(function BackCoverPage({ title }, ref) {
  return (
    <Leaf ref={ref} className="leaf--cover leaf--back" density="hard">
      <div className="cover">
        <div className="cover__frame cover__frame--back">
          <p className="cover__end">The End</p>
          <div className="cover__rule" />
          <p className="cover__imprint">{title}</p>
          <div className="cover__ornament">❦</div>
        </div>
      </div>
    </Leaf>
  );
});

/**
 * One text page. Static content: react-pageflip keeps its own copy of these elements and
 * (with `renderOnlyPageLengthChange`) never re-renders them, so the read-along highlight is
 * applied to the DOM imperatively via the data attributes — see the effect in BookViewer.
 */
const TextPage = memo(
  forwardRef<HTMLDivElement, { text: string; index: number; total: number; side: 'left' | 'right' }>(
    function TextPage({ text, index, total, side }, ref) {
      const words = useMemo(() => tokenizeWords(text), [text]);
      return (
        <Leaf ref={ref} className={`leaf--text leaf--${side}`} index={index}>
          {/* Font/line-height and total horizontal padding MUST match lib/paginate PAGE_BOX. */}
          <p className="leaf__text">
            {words.length === 0
              ? '(no text on this page)'
              : words.map((w, i) => (
                  <span key={i} data-w={i} className="read-word">
                    {w}{' '}
                  </span>
                ))}
          </p>
          <span className="leaf__folio">{index + 1}</span>
          <span className="leaf__folio-total">{total}</span>
        </Leaf>
      );
    }
  )
);

/** Flip index of a text page: the cover occupies index 0. */
const toFlipIndex = (page: number) => page + 1;

export default function BookViewer({
  pages,
  currentPage,
  onFlip,
  highlight,
  metrics,
  title,
  author,
  startOnCover,
}: BookViewerProps) {
  const bookRef = useRef<FlipBookHandle | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const marked = useRef<Element[]>([]);
  const startPage = useRef(startOnCover ? 0 : toFlipIndex(currentPage));

  // Follow the reader's current page (unless we're deliberately resting on the cover).
  const onCover = useRef(!!startOnCover);
  useEffect(() => {
    const api = bookRef.current?.pageFlip();
    if (!api) return;
    const target = toFlipIndex(currentPage);
    if (onCover.current && api.getCurrentPageIndex() === 0 && currentPage === 0) return;
    onCover.current = false;
    if (api.getCurrentPageIndex() !== target) api.flip(target);
  }, [currentPage]);

  // Container size changed (sidebar toggle, window resize) → let page-flip re-measure.
  useEffect(() => {
    bookRef.current?.pageFlip()?.update();
  }, [metrics.blockWidth, metrics.blockHeight]);

  // Read-along highlight, applied straight to the DOM (page-flip clones a page mid-flip;
  // every matching node gets the classes).
  useEffect(() => {
    for (const el of marked.current) el.classList.remove('read-word--phrase', 'read-word--now');
    marked.current = [];
    const root = wrapRef.current;
    if (!root || !highlight) return;
    root.querySelectorAll<HTMLElement>(`[data-page="${highlight.page}"]`).forEach((pageEl) => {
      for (let w = highlight.from; w < highlight.to; w++) {
        const el = pageEl.querySelector(`[data-w="${w}"]`);
        if (el) {
          el.classList.add('read-word--phrase');
          marked.current.push(el);
        }
      }
      const now = pageEl.querySelector(`[data-w="${highlight.word}"]`);
      if (now) {
        now.classList.add('read-word--now');
        marked.current.push(now);
      }
    });
  }, [highlight]);

  return (
    <div ref={wrapRef} className="book">
      <HTMLFlipBook
        ref={bookRef}
        size="stretch"
        width={PAGE.width}
        height={PAGE.height}
        minWidth={PAGE.minWidth}
        maxWidth={PAGE.maxWidth}
        minHeight={Math.round((PAGE.minWidth * PAGE.height) / PAGE.width)}
        maxHeight={Math.round((PAGE.maxWidth * PAGE.height) / PAGE.width)}
        startPage={startPage.current}
        showCover
        drawShadow
        flippingTime={800}
        usePortrait
        startZIndex={0}
        autoSize={false}
        maxShadowOpacity={0.5}
        mobileScrollSupport
        clickEventForward
        useMouseEvents
        swipeDistance={30}
        showPageCorners
        disableFlipByClick={false}
        renderOnlyPageLengthChange
        className="book__flip"
        style={{}}
        onFlip={(e: { data: number }) => {
          // Cover (0) and back cover (last) are not text pages; only report real pages.
          const page = e.data - 1;
          if (page >= 0 && page < pages.length) onFlip?.(page);
        }}
      >
        <CoverPage key="cover" title={title} author={author} />
        {pages.map((text, i) => (
          // With a hard cover at index 0, odd flip indices sit on the left of a spread.
          <TextPage key={i} text={text} index={i} total={pages.length} side={toFlipIndex(i) % 2 === 1 ? 'left' : 'right'} />
        ))}
        <BackCoverPage key="back" title={title} />
      </HTMLFlipBook>
    </div>
  );
}
