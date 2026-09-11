'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { listBooks, LOCAL_BOOKS_EVENT } from '@/lib/books';
import { isLocalMode } from '@/lib/supabase/env';
import type { BookRow } from '@/types/database';
import BookCover from './BookCover';
import { BookmarkIcon, CrownIcon, HistoryIcon, HomeIcon, LibraryIcon, SettingsIcon } from './icons';

const NAV = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/library', label: 'Library', Icon: LibraryIcon },
  { href: '/subscriptions', label: 'Subscriptions', Icon: CrownIcon },
  { href: '/bookmarks', label: 'Bookmarks', Icon: BookmarkIcon },
  { href: '/history', label: 'History', Icon: HistoryIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
];

const COLLAPSED_KEY = 'avatar-reader:sidebar-collapsed';

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl shadow-[0_0_24px_rgba(139,92,246,.5)]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1" fill="white" />
          <circle cx="15" cy="10" r="1" fill="white" />
          <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" strokeLinecap="round" />
        </svg>
      </span>
      <span>
        <span className="block text-lg font-semibold leading-tight text-white">Avatar Reader</span>
        <span className="block text-xs text-violet-200/70">Read. Listen. Imagine.</span>
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const refresh = () => void listBooks().then(setBooks).catch(() => setBooks([]));
    refresh();
    window.addEventListener(LOCAL_BOOKS_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_BOOKS_EVENT, refresh);
  }, [pathname]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {}
      return !c;
    });
  }

  const sidebar = (
    <aside className="flex h-full w-64 flex-col gap-6 overflow-y-auto border-r border-white/10 bg-[#100c1f]/90 px-5 py-6 backdrop-blur-xl">
      <Brand />

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active ? 'bg-violet-500/20 text-white ring-1 ring-violet-400/40' : 'text-violet-100/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="opacity-90" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-200/60">My Library</h3>
        <ul className="flex flex-col gap-2 overflow-y-auto pr-1">
          {books.length === 0 && (
            <li className="text-xs text-violet-200/50">
              Nothing yet.{' '}
              <Link href="/library" className="underline">
                Add a PDF
              </Link>
            </li>
          )}
          {books.slice(0, 8).map((b) => {
            const active = pathname === `/read/${b.id}`;
            return (
              <li key={b.id}>
                <Link
                  href={`/read/${b.id}`}
                  className={`flex items-center gap-3 rounded-lg p-1.5 transition hover:bg-white/5 ${active ? 'bg-white/5' : ''}`}
                >
                  <BookCover title={b.title ?? 'Untitled'} author={b.author} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{b.title ?? 'Untitled'}</span>
                    <span className="block truncate text-xs text-violet-200/60">{b.author ?? (b.page_count ? `${b.page_count} pages` : '')}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <Link
        href="/subscriptions"
        className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20 p-4 transition hover:from-violet-600/40"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <CrownIcon className="text-amber-300" width={18} height={18} /> Premium Subscription
        </span>
        <span className="mt-1 block text-xs text-violet-100/70">Unlimited eBooks, exclusive avatars and more!</span>
        <span className="mt-3 block rounded-lg bg-violet-500 px-3 py-2 text-center text-xs font-semibold text-white">
          Manage Subscription
        </span>
      </Link>

      {isLocalMode() && <p className="text-[10px] text-violet-200/40">Local library · this device</p>}
    </aside>
  );

  return (
    <div className="app-bg flex h-screen overflow-hidden text-white">
      <div className={`hidden shrink-0 overflow-hidden transition-[width] duration-300 lg:block ${collapsed ? 'w-0' : 'w-64'}`}>
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          {sidebar}
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          className="absolute left-2 top-3 z-30 hidden h-8 w-8 items-center justify-center rounded-md bg-white/10 text-sm backdrop-blur hover:bg-white/20 lg:flex"
        >
          {collapsed ? '»' : '«'}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="absolute left-2 top-3 z-30 flex h-8 items-center gap-1 rounded-md bg-white/10 px-2 text-xs backdrop-blur hover:bg-white/20 lg:hidden"
        >
          ☰ Menu
        </button>
        {children}
      </div>
    </div>
  );
}
