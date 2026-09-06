'use client';

import type { SpeakResponse } from '@/types/tts';

export type Clip = Pick<SpeakResponse, 'audioBase64' | 'visemes'> & {
  meta: Omit<SpeakResponse, 'audioBase64' | 'visemes'>;
};

// CLAUDE.md rule 2: never regenerate audio for a combo that's already cached.
// In local mode the browser is the only store we have: memory first, IndexedDB behind it,
// keyed by (book, page, chunk, avatar, voice, text hash). Supabase Storage can sit behind
// this same interface later.
const DB_NAME = 'avatar-reader';
const STORE = 'clips';
const memory = new Map<string, Clip>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Small, fast, non-cryptographic hash so edited text never collides with an old clip. */
export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function clipKey(parts: {
  bookId: string;
  page: number;
  chunk: number;
  avatarId: string;
  voice: string;
  text: string;
}): string {
  return `${parts.bookId}:${parts.page}:${parts.chunk}:${parts.avatarId}:${parts.voice || '-'}:${hashText(parts.text)}`;
}

export async function getClip(key: string): Promise<Clip | undefined> {
  const hit = memory.get(key);
  if (hit) return hit;
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => {
      const clip = req.result as Clip | undefined;
      if (clip) memory.set(key, clip);
      resolve(clip);
    };
    req.onerror = () => resolve(undefined);
  });
}

export async function putClip(key: string, clip: Clip): Promise<void> {
  memory.set(key, clip);
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(clip, key);
  } catch {
    // quota or private mode: memory cache still works for this session
  }
}

export function hasClipInMemory(key: string): boolean {
  return memory.has(key);
}
