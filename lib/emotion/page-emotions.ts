'use client';

import { hashText } from '@/lib/clip-cache';
import { buildTimeline, splitSentences } from './timeline';
import type { EmotionSpan, SentenceEmotion } from './types';

// Cached per (bookId, pageId, text hash) ONLY — the timeline comes from the text, so every
// avatar reading this page reuses it. Memory first, IndexedDB behind it.
const DB_NAME = 'avatar-reader';
const STORE = 'emotions';
const memory = new Map<string, EmotionSpan[]>();
const inflight = new Map<string, Promise<EmotionSpan[]>>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('clips')) db.createObjectStore('clips');
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<EmotionSpan[] | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as EmotionSpan[] | undefined);
    req.onerror = () => resolve(undefined);
  });
}

async function idbPut(key: string, value: EmotionSpan[]) {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
  } catch {}
}

export function emotionKey(bookId: string, pageId: number, text: string): string {
  return `${bookId}:${pageId}:${hashText(text)}`;
}

/** Sentence-level emotion timeline for a page, classified once and cached per (book, page). */
export function getPageEmotions(bookId: string, pageId: number, text: string, signal?: AbortSignal): Promise<EmotionSpan[]> {
  const key = emotionKey(bookId, pageId, text);
  const hit = memory.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const stored = await idbGet(key);
    if (stored) {
      memory.set(key, stored);
      return stored;
    }
    const sentences = splitSentences(text);
    if (sentences.length === 0) return [];
    const res = await fetch('/api/emotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentences: sentences.map((s) => s.text) }),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Emotion request failed (${res.status})`);
    }
    const { labels } = (await res.json()) as { labels: SentenceEmotion[] };
    const timeline = buildTimeline(sentences, labels);
    memory.set(key, timeline);
    void idbPut(key, timeline);
    return timeline;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}
