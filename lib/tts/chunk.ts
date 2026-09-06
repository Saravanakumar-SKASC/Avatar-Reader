/**
 * Splits page text into short speakable chunks so playback can start after the first
 * one instead of waiting for the whole page. Word indices are preserved so the reader
 * can highlight words across chunk boundaries.
 */

export interface Chunk {
  text: string;
  /** Index of the first word in the page's whitespace-split word list. */
  startWord: number;
  wordCount: number;
  /** fractions[i] = fraction of the chunk's duration at which word i ENDS (0..1]. */
  fractions: number[];
}

export const DEFAULT_CHUNK_CHARS = 240;
/** The first chunk is kept short so playback starts sooner; later chunks stream in behind it. */
export const FIRST_CHUNK_CHARS = 110;

export function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function endsSentence(word: string): boolean {
  return /[.!?…]["')\]]*$/.test(word);
}

/** Character-weighted cumulative end fractions — a proxy for speech timing within a chunk. */
export function wordFractions(words: string[]): number[] {
  const weights = words.map((w) => w.replace(/[^\w\u00C0-\u024F]/g, '').length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return weights.map((w) => (acc += w) / total);
}

export function splitIntoChunks(text: string, maxChars = DEFAULT_CHUNK_CHARS, firstChunkChars = FIRST_CHUNK_CHARS): Chunk[] {
  const words = tokenizeWords(text);
  const chunks: Chunk[] = [];
  let start = 0;
  let len = 0;

  const flush = (end: number) => {
    if (end <= start) return;
    const slice = words.slice(start, end);
    chunks.push({ text: slice.join(' '), startWord: start, wordCount: slice.length, fractions: wordFractions(slice) });
    start = end;
    len = 0;
  };

  for (let i = 0; i < words.length; i++) {
    len += words[i].length + 1;
    const last = i === words.length - 1;
    const target = chunks.length === 0 ? Math.min(maxChars, firstChunkChars) : maxChars;
    // Prefer cutting at a sentence end once we're past the target; force a cut well past it.
    if (last || (len >= target && endsSentence(words[i])) || len >= target * 1.8) flush(i + 1);
  }
  return chunks;
}

/** Word index (within the chunk) being spoken at `fraction` of the way through its audio. */
export function wordAtFraction(fractions: number[], fraction: number): number {
  const i = fractions.findIndex((end) => fraction < end);
  return i < 0 ? Math.max(0, fractions.length - 1) : i;
}
