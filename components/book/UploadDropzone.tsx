'use client';

import { useRef, useState, type DragEvent } from 'react';
import { createBook } from '@/lib/books';
import type { LoadedBook } from '@/types/book';

type ExtractResult = { pageCount: number; pages: string[] };

/**
 * Drop a PDF (or pick one / load the demo). Extracts text via /api/extract, saves the book
 * through the active store, and hands the loaded book back — no navigation involved.
 */
export default function UploadDropzone({
  onLoaded,
  onCancel,
}: {
  onLoaded: (book: LoadedBook) => void;
  /** When provided, a Cancel button is shown (modal usage). */
  onCancel?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ingest(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.');
      return;
    }
    setBusy('Extracting text…');
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Extraction failed (${res.status})`);
      }
      const { pages } = (await res.json()) as ExtractResult;
      setBusy('Saving…');
      const row = await createBook(file, pages);
      onLoaded({ ...row, pages });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setBusy(null);
    }
  }

  async function loadDemo() {
    setBusy('Loading demo…');
    setError(null);
    try {
      const res = await fetch('/demo/lighthouse.pdf');
      if (!res.ok) throw new Error('Demo PDF missing');
      await ingest(new File([await res.blob()], 'The Lighthouse at Marrow Point.pdf', { type: 'application/pdf' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load demo');
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingest(file);
  }

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragging ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/20 bg-white/5 hover:bg-white/10'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? (
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        ) : (
          <span className="text-3xl">📄</span>
        )}
        <span className="font-medium">{busy ?? 'Drop a PDF here'}</span>
        {!busy && <span className="text-sm text-gray-400">or click to choose a file</span>}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ingest(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={loadDemo}
          disabled={!!busy}
          className="rounded border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          ▶ Try the demo book
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={!!busy} className="text-sm text-gray-400 underline">
            Cancel
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
