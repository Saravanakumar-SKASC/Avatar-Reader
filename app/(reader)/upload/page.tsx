'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { saveBook } from '@/lib/book-store';

type ExtractResult = { pageCount: number; pages: string[] };

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { pages } = (await res.json()) as ExtractResult;
      const book = saveBook(file.name, pages);
      router.push(`/read/${book.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Upload a PDF</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block"
        />
        <button
          type="submit"
          disabled={!file || loading}
          className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Extracting…' : 'Open as book'}
        </button>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}
    </main>
  );
}
