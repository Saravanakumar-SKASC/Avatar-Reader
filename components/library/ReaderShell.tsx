'use client';

import { useState, type ReactNode } from 'react';

/**
 * Layout frame for the reader pages. The Library sidebar is always visible on wide
 * screens; on narrow ones (phone, Chrome side panel) it collapses behind a toggle
 * and slides over the content.
 */
export default function ReaderShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen text-white">
      <div className="warm-bg" aria-hidden />

      {/* wide: static sidebar */}
      <div className="hidden lg:block">{sidebar}</div>

      {/* narrow: slide-over */}
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div onClick={() => setOpen(false)}>{sidebar}</div>
          <div className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded bg-white/10 px-3 py-1 text-sm"
            aria-label="Open library"
          >
            ☰ Library
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
