// Server-only. Free, local, zero-cost emotion classification with @huggingface/transformers
// (the maintained successor of @xenova/transformers). Model weights download once
// (~125 MB quantized) into EMOTION_MODEL_CACHE (default ./.cache/transformers).

import type { Emotion, SentenceEmotion } from './types';

const DEFAULT_MODEL = 'SamLowe/roberta-base-go_emotions-onnx';

/** GoEmotions' 28 labels → the five VRM expressions. */
const LABEL_TO_EMOTION: Record<string, Emotion> = {
  admiration: 'happy', amusement: 'happy', approval: 'relaxed', caring: 'relaxed',
  curiosity: 'surprised', desire: 'happy', excitement: 'happy', gratitude: 'happy',
  joy: 'happy', love: 'happy', optimism: 'happy', pride: 'happy', relief: 'relaxed',
  anger: 'angry', annoyance: 'angry', disapproval: 'angry', disgust: 'angry',
  disappointment: 'sad', embarrassment: 'sad', grief: 'sad', remorse: 'sad', sadness: 'sad',
  confusion: 'surprised', fear: 'surprised', nervousness: 'surprised', realization: 'surprised',
  surprise: 'surprised',
  neutral: 'neutral',
};

type Classifier = (
  texts: string[],
  opts: { top_k: number }
) => Promise<{ label: string; score: number }[][]>;

let loading: Promise<Classifier> | null = null;

async function getClassifier(): Promise<Classifier> {
  if (!loading) {
    loading = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = process.env.EMOTION_MODEL_CACHE ?? './.cache/transformers';
      const model = process.env.EMOTION_MODEL ?? DEFAULT_MODEL;
      const clf = await pipeline('text-classification', model, { dtype: 'q8' });
      return clf as unknown as Classifier;
    })().catch((err) => {
      loading = null; // allow a retry on the next call
      throw err;
    });
  }
  return loading;
}

/** Collapse the top labels into the strongest VRM emotion (summing scores that map to the same one). */
export function reduceLabels(labels: { label: string; score: number }[]): SentenceEmotion {
  const totals = new Map<Emotion, number>();
  for (const { label, score } of labels) {
    const e = LABEL_TO_EMOTION[label.toLowerCase()] ?? 'neutral';
    totals.set(e, (totals.get(e) ?? 0) + score);
  }
  let best: SentenceEmotion = { emotion: 'neutral', score: 0 };
  totals.forEach((score, emotion) => {
    if (emotion !== 'neutral' && score > best.score) best = { emotion, score };
  });
  // Weak, ambiguous signals read as neutral rather than a faint random expression.
  return best.score >= 0.25 ? best : { emotion: 'neutral', score: 0 };
}

export async function classifyLocal(sentences: string[]): Promise<SentenceEmotion[]> {
  if (sentences.length === 0) return [];
  const clf = await getClassifier();
  const out = await clf(sentences, { top_k: 5 });
  return out.map(reduceLabels);
}
