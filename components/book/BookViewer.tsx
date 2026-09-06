'use client';

import HTMLFlipBook from 'react-pageflip';
import { useRef, useEffect } from 'react';

// page-flip ships no type declarations; this covers the methods we call.
interface PageFlipApi {
  flip(page: number): void;
  getCurrentPageIndex(): number;
}
interface FlipBookHandle {
  pageFlip(): PageFlipApi | undefined;
}

interface BookViewerProps {
  pages: string[];
  currentPage: number;
  /** Fired when the user flips by drag/click, so the parent can stay in sync. */
  onFlip?: (page: number) => void;
}

export default function BookViewer({ pages, currentPage, onFlip }: BookViewerProps) {
  const bookRef = useRef<FlipBookHandle | null>(null);

  useEffect(() => {
    const api = bookRef.current?.pageFlip();
    if (api && api.getCurrentPageIndex() !== currentPage) {
      api.flip(currentPage);
    }
  }, [currentPage]);

  return (
    <HTMLFlipBook
      ref={bookRef}
      width={480}
      height={640}
      size="fixed"
      minWidth={480}
      maxWidth={480}
      minHeight={640}
      maxHeight={640}
      startPage={0}
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
      className=""
      style={{}}
      onFlip={(e: { data: number }) => onFlip?.(e.data)}
    >
      {pages.map((text, i) => (
        <div className="page overflow-hidden bg-[#f5efe3] p-8 shadow-inner" key={i}>
          <p className="font-serif leading-relaxed text-gray-900">{text || '(no text on this page)'}</p>
          <span className="absolute bottom-4 right-6 text-xs text-gray-400">
            {i + 1} / {pages.length}
          </span>
        </div>
      ))}
    </HTMLFlipBook>
  );
}
