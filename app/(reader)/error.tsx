'use client';

export default function ReaderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-white">
      <h1 className="text-xl font-semibold">The reader hit an error</h1>
      <p className="max-w-md text-center text-sm text-gray-300">{error.message || 'Unexpected error.'}</p>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium">
          Try again
        </button>
        <a href="/read/new" className="rounded bg-white/10 px-4 py-2 text-sm">
          Open another PDF
        </a>
      </div>
    </main>
  );
}
