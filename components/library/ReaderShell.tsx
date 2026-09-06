'use client';

import { useEffect, useState, type ReactNode } from 'react';

const COLLAPSED_KEY = 'avatar-reader:library-collapsed';

/**
 * Full-viewport frame for the reader. The Library lives in a collapsible panel:
 * a docked column on wide screens (toggle remembers its state), a slide-over on narrow ones.
 */
export default function ReaderShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {}
      return !c;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden text-white">
      <div className="warm-bg" aria-hidden />

      {/* wide: docked, collapsible */}
      <div
        className={`hidden shrink-0 overflow-hidden transition-[width] duration-300 lg:block ${collapsed ? 'w-0' : 'w-64'}`}
      >
        <div className="h-full w-64">{sidebar}</div>
      </div>

      {/* narrow: slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div onClick={() => setMobileOpen(false)}>{sidebar}</div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* wide toggle */}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Show library' : 'Hide library'}
          aria-label={collapsed ? 'Show library' : 'Hide library'}
          className="absolute left-2 top-2 z-30 hidden h-8 w-8 items-center justify-center rounded-md bg-white/10 text-sm backdrop-blur hover:bg-white/20 lg:flex"
        >
          {collapsed ? '»' : '«'}
        </button>
        {/* narrow toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open library"
          className="absolute left-2 top-2 z-30 flex h-8 items-center gap-1 rounded-md bg-white/10 px-2 text-xs backdrop-blur hover:bg-white/20 lg:hidden"
        >
          ☰ Library
        </button>
        {children}
      </div>
    </div>
  );
}
