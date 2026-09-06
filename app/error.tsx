'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-gray-500">{error.message || 'Unexpected error.'}</p>
      <button onClick={reset} className="w-fit rounded bg-black px-4 py-2 text-sm text-white">
        Try again
      </button>
    </main>
  );
}
