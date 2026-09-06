import type { WordTiming } from '@/types/tts';

export interface RecognisedWord {
  text: string;
  start: number;
  end: number;
}

export function normalise(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/g, '');
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  if (short.length >= 3 && long.startsWith(short)) return true; // "walk" vs "walking"
  if (short.length >= 5 && long.length - short.length <= 1) {
    // one substitution / insertion apart
    let i = 0, j = 0, edits = 0;
    while (i < short.length && j < long.length) {
      if (short[i] === long[j]) { i++; j++; }
      else { edits++; if (edits > 1) return false; if (short.length === long.length) { i++; j++; } else j++; }
    }
    return true;
  }
  return false;
}

/**
 * Monotonic alignment (LCS-style DP) of the source words against Whisper's recognised
 * words. Matched words take Whisper's timestamps; unmatched runs are interpolated between
 * their neighbours by character weight, so every source word gets a [start, end).
 */
export function alignWords(sourceWords: string[], recognised: RecognisedWord[], duration: number): WordTiming[] {
  const n = sourceWords.length;
  const m = recognised.length;
  if (n === 0) return [];
  const src = sourceWords.map(normalise);
  const rec = recognised.map((r) => normalise(r.text));

  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = similar(src[i], rec[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Array<RecognisedWord | null>(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (similar(src[i], rec[j])) { matched[i] = recognised[j]; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  // Fill gaps by interpolation.
  const out: WordTiming[] = new Array(n);
  const weight = (w: string) => Math.max(1, normalise(w).length) + 1;
  let i = 0;
  while (i < n) {
    if (matched[i]) {
      out[i] = { start: matched[i]!.start, end: matched[i]!.end };
      i++;
      continue;
    }
    let k = i;
    while (k < n && !matched[k]) k++;
    const gapStart = i === 0 ? 0 : out[i - 1].end;
    const gapEnd = k < n ? matched[k]!.start : Math.max(duration, gapStart);
    const total = sourceWords.slice(i, k).reduce((s, w) => s + weight(w), 0);
    let t = gapStart;
    for (let q = i; q < k; q++) {
      const span = ((gapEnd - gapStart) * weight(sourceWords[q])) / total;
      out[q] = { start: t, end: t + span };
      t += span;
    }
    i = k;
  }
  // Enforce monotonic, non-negative timings.
  let prevEnd = 0;
  for (const w of out) {
    if (w.start < prevEnd) w.start = prevEnd;
    if (w.end < w.start) w.end = w.start;
    prevEnd = w.end;
  }
  return out;
}

/** Index of the word being spoken at `t` seconds (binary search); the last word once past the end. */
export function wordAtTime(words: WordTiming[], t: number): number {
  if (words.length === 0) return -1;
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t < words[mid].end) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
