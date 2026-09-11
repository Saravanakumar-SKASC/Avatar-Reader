'use client';

import { useEffect, useState } from 'react';
import { AVATARS } from '@/lib/avatars';
import { getProfile, setProfile, type ReaderProfile } from '@/lib/local/profile';
import { DEFAULT_SETTINGS, FONT_SIZES, getSettings, updateSettings, type FontSize, type ReaderSettings } from '@/lib/local/settings';
import { isLocalMode } from '@/lib/supabase/env';
import PageHeader from '@/components/app/PageHeader';
import type { AvatarId } from '@/types/avatar';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-violet-200/60">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-sm text-white">{label}</div>
        {hint && <div className="text-xs text-violet-200/60">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const EMOJIS = ['🙂', '🧑‍🚀', '🦊', '🐼', '🦉', '🐉', '🌙', '⭐', '🎧', '📚'];

export default function SettingsPage() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [profile, setLocalProfile] = useState<ReaderProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(getSettings());
    setLocalProfile(getProfile());
  }, []);

  function patch(p: Partial<ReaderSettings>) {
    setSettings(updateSettings(p));
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = setProfile({
      name: String(fd.get('name') || 'Reader').trim() || 'Reader',
      email: String(fd.get('email') || '').trim() || undefined,
      emoji: profile?.emoji ?? '🙂',
      createdAt: profile?.createdAt,
    });
    setLocalProfile(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  async function clearCaches() {
    if (!confirm('Clear cached narration audio and emotion timelines? Books and progress are kept.')) return;
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('avatar-reader');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
    alert('Cache cleared.');
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader title="Settings" subtitle={saved ? 'Saved ✓' : 'Preferences are saved on this device.'} />
      <div className="grid gap-6 px-6 pb-10 lg:grid-cols-2 lg:px-10">
        {isLocalMode() && (
          <Section title="Profile">
            <form onSubmit={saveProfile} className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setLocalProfile((p) => (p ? { ...p, emoji: e } : { name: 'Reader', emoji: e, createdAt: new Date().toISOString() }))}
                    className={`h-10 w-10 rounded-full text-xl ${profile?.emoji === e ? 'bg-violet-500/40 ring-2 ring-violet-300' : 'bg-white/5 hover:bg-white/10'}`}
                    aria-label={`Use ${e} as your avatar`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <label className="text-xs text-violet-200/60">
                Name
                <input name="name" defaultValue={profile?.name ?? ''} required className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none" />
              </label>
              <label className="text-xs text-violet-200/60">
                Email (optional)
                <input name="email" type="email" defaultValue={profile?.email ?? ''} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none" />
              </label>
              <button type="submit" className="w-fit rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400">
                Save profile
              </button>
            </form>
          </Section>
        )}

        <Section title="Reading">
          <Row label="Text size" hint="Re-flows the book; narration for a new size is generated once and cached.">
            <div className="flex gap-1 rounded-full bg-white/10 p-1">
              {(Object.keys(FONT_SIZES) as FontSize[]).map((k) => (
                <button key={k} type="button" onClick={() => patch({ fontSize: k })} className={`rounded-full px-3 py-1 text-sm ${settings.fontSize === k ? 'bg-white text-[#1a1530]' : 'text-violet-100/80 hover:bg-white/10'}`}>
                  {FONT_SIZES[k].label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Auto-advance pages" hint="Keep reading into the next page when one finishes.">
            <button type="button" role="switch" aria-checked={settings.autoAdvance} onClick={() => patch({ autoAdvance: !settings.autoAdvance })} className={`h-7 w-12 rounded-full p-1 transition ${settings.autoAdvance ? 'bg-violet-500' : 'bg-white/20'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white transition ${settings.autoAdvance ? 'translate-x-5' : ''}`} />
            </button>
          </Row>
          <Row label="Narrator captions" hint="Show what the narrator is saying in a speech bubble.">
            <button type="button" role="switch" aria-checked={settings.captions} onClick={() => patch({ captions: !settings.captions })} className={`h-7 w-12 rounded-full p-1 transition ${settings.captions ? 'bg-violet-500' : 'bg-white/20'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white transition ${settings.captions ? 'translate-x-5' : ''}`} />
            </button>
          </Row>
        </Section>

        <Section title="Narrator">
          <Row label="Default narrator" hint="Used when you open a book for the first time.">
            <select
              value={settings.defaultAvatar ?? ''}
              onChange={(e) => patch({ defaultAvatar: (e.target.value || null) as AvatarId | null })}
              className="rounded-lg border border-white/10 bg-[#161226] px-3 py-2 text-sm text-white focus:border-violet-400 focus:outline-none"
            >
              <option value="">Last used</option>
              {AVATARS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.personality}
                </option>
              ))}
            </select>
          </Row>
        </Section>

        <Section title="Storage">
          <Row label="Narration cache" hint="Cached audio, visemes, word timings and emotion timelines (IndexedDB).">
            <button type="button" onClick={clearCaches} className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200 hover:bg-red-500/10">
              Clear cache
            </button>
          </Row>
          <Row label="Mode" hint={isLocalMode() ? 'Local: books and progress stay in this browser.' : 'Cloud: synced with your Supabase account.'}>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-violet-100/80">{isLocalMode() ? 'Local' : 'Cloud'}</span>
          </Row>
        </Section>
      </div>
    </main>
  );
}
