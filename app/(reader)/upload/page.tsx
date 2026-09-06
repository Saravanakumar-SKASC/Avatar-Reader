'use client';

import { FormEvent, useState } from 'react';

type ExtractResult = { pageCount: number; pages: string[] };

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setResult((await res.json()) as ExtractResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
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
          {loading ? 'Extracting…' : 'Extract text'}
        </button>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {result && (
        <section className="mt-8">
          <p className="mb-4 font-medium">{result.pageCount} page(s)</p>
          <ol className="flex flex-col gap-6">
            {result.pages.map((text, i) => (
              <li key={i} className="rounded border p-4">
                <p className="mb-2 text-sm text-gray-500">Page {i + 1}</p>
                <p className="whitespace-pre-wrap text-sm">{text || '(no text)'}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
