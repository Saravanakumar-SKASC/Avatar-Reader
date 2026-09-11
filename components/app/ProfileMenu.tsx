'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clearProfile, getProfile, PROFILE_EVENT, type ReaderProfile } from '@/lib/local/profile';
import { isLocalMode } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/client';
import { UserIcon } from './icons';

export default function ProfileMenu({ email }: { email?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setProfile(getProfile());
    refresh();
    window.addEventListener(PROFILE_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function signOut() {
    if (isLocalMode()) clearProfile();
    else await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const name = profile?.name ?? email ?? 'Reader';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/30 text-lg ring-1 ring-violet-300/40 hover:bg-violet-500/40"
        title={name}
      >
        {profile?.emoji ?? <UserIcon />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-white/10 bg-[#161226] p-2 shadow-2xl">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium text-white">{name}</div>
            {(profile?.email || email) && <div className="truncate text-xs text-violet-200/60">{profile?.email ?? email}</div>}
          </div>
          <Link href="/settings" className="block rounded-lg px-3 py-2 text-sm text-violet-100/80 hover:bg-white/5" role="menuitem">
            Settings
          </Link>
          <Link href="/bookmarks" className="block rounded-lg px-3 py-2 text-sm text-violet-100/80 hover:bg-white/5" role="menuitem">
            Bookmarks
          </Link>
          <button type="button" onClick={signOut} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-white/5" role="menuitem">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
