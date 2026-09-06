import { tokenizeWords } from '@/lib/tts/chunk';
import type { EmotionCue, EmotionSpan, SentenceEmotion } from './types';

export interface Sentence {
  text: string;
  startWord: number;
  endWord: number; // exclusive
}

/** Split page text into sentences on the same word tokenisation the TTS chunker uses. */
export function splitSentences(text: string): Sentence[] {
  const words = tokenizeWords(text);
  const out: Sentence[] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const last = i === words.length - 1;
    if (last || /[.!?…]["')\]]*$/.test(words[i])) {
      out.push({ text: words.slice(start, i + 1).join(' '), startWord: start, endWord: i + 1 });
      start = i + 1;
    }
  }
  return out;
}

/** Sentence labels → page timeline in word indices. Duration is proportional to words, by construction. */
export function buildTimeline(sentences: Sentence[], labels: SentenceEmotion[]): EmotionSpan[] {
  return sentences.map((s, i) => ({
    startWord: s.startWord,
    endWord: s.endWord,
    emotion: labels[i]?.emotion ?? 'neutral',
    score: labels[i]?.score ?? 0,
  }));
}

/**
 * Project the page timeline onto one audio clip. `fractions[i]` is the fraction of the clip
 * at which the chunk's word i ends (see lib/tts/chunk), so a word range maps to a time range.
 */
export function cuesForChunk(
  timeline: EmotionSpan[],
  chunkStartWord: number,
  wordCount: number,
  fractions: number[]
): EmotionCue[] {
  const chunkEnd = chunkStartWord + wordCount;
  const cues: EmotionCue[] = [];
  for (const span of timeline) {
    const from = Math.max(span.startWord, chunkStartWord);
    const to = Math.min(span.endWord, chunkEnd);
    if (to <= from) continue;
    const start = from === chunkStartWord ? 0 : fractions[from - chunkStartWord - 1] ?? 0;
    const end = fractions[to - chunkStartWord - 1] ?? 1;
    cues.push({ start, end, emotion: span.emotion, score: span.score });
  }
  return cues;
}

export function emotionAt(cues: EmotionCue[], fraction: number): EmotionCue | undefined {
  return cues.find((c) => fraction >= c.start && fraction < c.end) ?? cues[cues.length - 1];
}
