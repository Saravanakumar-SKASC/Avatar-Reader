'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/supabase/env';
import { setProfile } from '@/lib/local/profile';
import { Brand } from '@/components/app/AppShell';
import { AVATARS } from '@/lib/avatars';

type Mode = 'signin' | 'signup';
const EMOJIS = ['🙂', '🧑‍🚀', '🦊', '🐼', '🦉', '🐉', '🌙', '⭐'];

function LocalForm({ next }: { next: string }) {
  const router = useRouter();
  const [emoji, setEmoji] = useState('🙂');
  const [busy, setBusy] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    setBusy(true);
    setProfile({ name, email: String(fd.get('email') || '').trim() || undefined, emoji });
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-xs text-violet-200/60">Pick your reader avatar</div>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => setEmoji(e)} aria-label={`Use ${e}`} className={`h-11 w-11 rounded-full text-xl transition ${emoji === e ? 'bg-violet-500/40 ring-2 ring-violet-300' : 'bg-white/5 hover:bg-white/10'}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <label className="text-xs text-violet-200/60">
        Your name
        <input name="name" required autoFocus autoComplete="name" placeholder="e.g. Sara" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none" />
      </label>
      <label className="text-xs text-violet-200/60">
        Email <span className="opacity-60">(optional)</span>
        <input name="email" type="email" autoComplete="email" placeholder="you@example.com" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none" />
      </label>
      <button type="submit" disabled={busy} className="mt-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,.4)] hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-60">
        {busy ? 'Opening your library…' : 'Start reading'}
      </button>
      <p className="text-center text-[11px] text-violet-200/50">No account or password needed. Your library lives in this browser.</p>
    </form>
  );
}

function SupabaseForm({ next }: { next: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(params.get('error') === 'auth' ? 'Sign-in link was invalid or expired. Try again.' : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (data.session) {
          router.push(next);
          router.refresh();
        } else setMessage('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none';
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={google} disabled={busy} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50">
        Continue with Google
      </button>
      <div className="text-center text-xs text-violet-200/50">or with email</div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        <input type="password" required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        <button type="submit" disabled={busy} className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      {message && <p className="text-sm text-red-300">{message}</p>}
      <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-sm text-violet-300 underline-offset-2 hover:underline">
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}

function LoginScreen() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const local = isLocalMode();

  return (
    <main className="app-bg flex min-h-screen items-center justify-center p-4 text-white">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#120e22]/80 shadow-[0_40px_120px_rgba(0,0,0,.6)] backdrop-blur-xl lg:grid-cols-[1.1fr_1fr]">
        {/* Brand panel */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-700/40 via-[#1a1530] to-[#0f0b1c] p-10 lg:flex">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-amber-400/15 blur-3xl" />
          <Brand />
          <div>
            <h1 className="font-serif text-5xl leading-tight text-white">
              Every book,
              <br />
              read to you
              <br />
              <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">by a face you choose.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm text-violet-100/70">
              Upload a PDF. A 3D narrator reads it aloud with expressions, lip-sync and a page-turning book — and remembers where you left off.
            </p>
            <div className="mt-8 flex -space-x-3">
              {AVATARS.map((a) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={a.thumbnailUrl} alt={a.name} title={`${a.name} · ${a.personality}`} className="h-12 w-12 rounded-full object-cover ring-2 ring-[#1a1530]" />
              ))}
            </div>
          </div>
          <p className="text-xs text-violet-200/50">7 narrators · expressions · word-by-word highlight · free while in preview</p>
        </section>

        {/* Form panel */}
        <section className="flex flex-col justify-center gap-6 p-8 sm:p-12">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white">{local ? 'Welcome, reader' : 'Sign in'}</h2>
            <p className="text-sm text-violet-200/60">{local ? 'Set up your reader profile to open your library.' : 'Your library syncs across devices.'}</p>
          </div>
          {local ? <LocalForm next={next} /> : <SupabaseForm next={next} />}
        </section>
      </div>
    </main>
  );
}

// useSearchParams needs a Suspense boundary so the page can be prerendered.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
