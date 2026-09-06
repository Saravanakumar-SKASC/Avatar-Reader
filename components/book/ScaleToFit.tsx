'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Orientation = 'portrait' | 'landscape';

/**
 * Renders the fixed-size flip-book scaled to the available width. Below `portraitBelow`
 * px the book is laid out as a single 480-wide page (portrait) so text stays readable on
 * phones and in Chrome's side panel; wider containers get the 960-wide two-page spread.
 */
export default function ScaleToFit({
  pageWidth,
  pageHeight,
  portraitBelow = 720,
  children,
}: {
  pageWidth: number;
  pageHeight: number;
  portraitBelow?: number;
  children: (orientation: Orientation) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setContainer(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const orientation: Orientation = container > 0 && container < portraitBelow ? 'portrait' : 'landscape';
  const width = orientation === 'portrait' ? pageWidth : pageWidth * 2;
  const scale = container > 0 ? Math.min(1, container / width) : 1;

  return (
    <div ref={ref} className="w-full" style={{ maxWidth: pageWidth * 2 }}>
      <div style={{ width: width * scale, height: pageHeight * scale, margin: '0 auto' }}>
        <div style={{ width, height: pageHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {container > 0 && children(orientation)}
        </div>
      </div>
    </div>
  );
}
