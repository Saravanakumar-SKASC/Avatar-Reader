import { describe, expect, it } from 'vitest';
import { buildTimeline, cuesForChunk, emotionAt, splitSentences } from '../lib/emotion/timeline';
import { reduceLabels } from '../lib/emotion/classify-local';
import { splitIntoChunks } from '../lib/tts/chunk';

const text = 'She laughed out loud. Then the door slammed! Nothing happened for a while. Why is it so dark?';

describe('splitSentences', () => {
  it('splits on terminal punctuation with contiguous word ranges', () => {
    const s = splitSentences(text);
    expect(s.map((x) => x.text)).toEqual([
      'She laughed out loud.',
      'Then the door slammed!',
      'Nothing happened for a while.',
      'Why is it so dark?',
    ]);
    for (let i = 1; i < s.length; i++) expect(s[i].startWord).toBe(s[i - 1].endWord);
  });
});

describe('reduceLabels', () => {
  it('maps go_emotions labels to VRM expressions, summing same-target scores', () => {
    expect(reduceLabels([{ label: 'joy', score: 0.5 }, { label: 'amusement', score: 0.3 }])).toEqual({ emotion: 'happy', score: 0.8 });
    expect(reduceLabels([{ label: 'anger', score: 0.7 }])).toEqual({ emotion: 'angry', score: 0.7 });
  });
  it('treats weak or neutral signals as neutral', () => {
    expect(reduceLabels([{ label: 'neutral', score: 0.9 }, { label: 'joy', score: 0.1 }]).emotion).toBe('neutral');
  });
});

describe('timeline → clip cues', () => {
  it('projects sentence spans onto a chunk as duration fractions, in order', () => {
    const sentences = splitSentences(text);
    const timeline = buildTimeline(sentences, [
      { emotion: 'happy', score: 0.9 },
      { emotion: 'angry', score: 0.8 },
      { emotion: 'neutral', score: 0 },
      { emotion: 'surprised', score: 0.7 },
    ]);
    const [chunk] = splitIntoChunks(text, 1000, 1000); // whole text as one chunk
    const cues = cuesForChunk(timeline, chunk.startWord, chunk.wordCount, chunk.fractions);
    expect(cues.map((c) => c.emotion)).toEqual(['happy', 'angry', 'neutral', 'surprised']);
    expect(cues[0].start).toBe(0);
    expect(cues[cues.length - 1].end).toBeCloseTo(1);
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeCloseTo(cues[i - 1].end);
    expect(emotionAt(cues, 0.01)?.emotion).toBe('happy');
    expect(emotionAt(cues, 0.99)?.emotion).toBe('surprised');
  });
  it('handles a chunk that starts mid-sentence', () => {
    const sentences = splitSentences(text);
    const timeline = buildTimeline(sentences, sentences.map(() => ({ emotion: 'sad' as const, score: 0.6 })));
    const cues = cuesForChunk(timeline, 2, 3, [0.3, 0.6, 1]); // words 2..4 ("out loud. Then")
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 0, end: 0.6 });
    expect(cues[1]).toMatchObject({ start: 0.6, end: 1 });
  });
});
