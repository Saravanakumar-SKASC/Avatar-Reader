'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PAGE, computeMetrics, type BookMetrics, type Orientation } from '@/lib/book-metrics';

export { PAGE, computeMetrics, type BookMetrics, type Orientation };

/**
 * Measures the stage and hands the flip-book a container that fits it. Sets `--page-scale`
 * so each page's fixed 480×640 content layer scales to the real page size (pagination stays
 * exact at every size).
 */
export default function BookFrame({
  className,
  children,
}: {
  className?: string;
  children: (metrics: BookMetrics) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = stage.w > 0 && stage.h > 0 ? computeMetrics(stage.w, stage.h) : null;

  return (
    <div ref={ref} className={`flex h-full w-full items-center justify-center ${className ?? ''}`}>
      {metrics && (
        <div
          className={`book-frame book-frame--${metrics.orientation}`}
          style={
            {
              width: metrics.blockWidth,
              height: metrics.blockHeight,
              '--page-scale': metrics.pageWidth / PAGE.width,
            } as React.CSSProperties
          }
        >
          {children(metrics)}
        </div>
      )}
    </div>
  );
}
