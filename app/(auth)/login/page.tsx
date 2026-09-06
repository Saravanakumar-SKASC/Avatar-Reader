'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/supabase/env';

type Mode = 'signin' | 'signup';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/read/new';
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    params.get('error') === 'auth' ? 'Sign-in link was invalid or expired. Try again.' : null
  );

  if (isLocalMode()) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="mb-2 text-xl font-semibold">Local mode</h1>
        <p className="text-sm text-gray-600">
          No account needed. Books are stored in this browser.{' '}
          <a href="/read/new" className="underline">
            Go to the reader
          </a>
          .
        </p>
      </main>
    );
  }

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
        } else {
          setMessage('Check your email for a confirmation link.');
        }
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
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>

      <button
        type="button"
        onClick={google}
        disabled={busy}
        className="rounded border px-4 py-2 font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        Continue with Google
      </button>

      <div className="text-center text-xs text-gray-400">or with email</div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      {message && <p className="text-sm text-red-600">{message}</p>}

      <button
        type="button"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="text-sm text-gray-500 underline"
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </main>
  );
}

// useSearchParams needs a Suspense boundary so the page can be prerendered.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
