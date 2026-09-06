'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Orientation = 'portrait' | 'landscape';

/**
 * Renders the fixed-size flip-book scaled to fit BOTH the available width and height
 * (the reader is a single non-scrolling screen). Narrow containers get one page
 * (portrait); wider ones the two-page spread.
 */
export default function ScaleToFit({
  pageWidth,
  pageHeight,
  portraitBelow = 720,
  className,
  children,
}: {
  pageWidth: number;
  pageHeight: number;
  portraitBelow?: number;
  className?: string;
  children: (orientation: Orientation, scale: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const orientation: Orientation = size.w > 0 && size.w < portraitBelow ? 'portrait' : 'landscape';
  const width = orientation === 'portrait' ? pageWidth : pageWidth * 2;
  const scale = size.w > 0 ? Math.min(1, size.w / width, size.h > 0 ? size.h / pageHeight : 1) : 1;

  return (
    <div ref={ref} className={`flex h-full w-full items-center justify-center ${className ?? ''}`}>
      {size.w > 0 && (
        <div style={{ width: width * scale, height: pageHeight * scale }}>
          <div style={{ width, height: pageHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {children(orientation, scale)}
          </div>
        </div>
      )}
    </div>
  );
}
