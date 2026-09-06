// Server-only. Word-level timestamps for a TTS clip via @huggingface/transformers' Whisper
// pipeline (automatic-speech-recognition, return_timestamps: 'word'). Free and local: the
// model (~40 MB quantized) downloads once into EMOTION_MODEL_CACHE / ./.cache/transformers.

import { tokenizeWords } from '@/lib/tts/chunk';
import type { WordTiming } from '@/types/tts';
import { alignWords, type RecognisedWord } from './align';
import { decodeWav, resample } from './wav-decode';

const DEFAULT_MODEL = 'onnx-community/whisper-tiny.en_timestamped'; // exported with cross-attentions (required for word timestamps)
const WHISPER_RATE = 16000;

type AsrResult = { text: string; chunks?: { text: string; timestamp: [number, number | null] }[] };
type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<AsrResult>;

let loading: Promise<Asr> | null = null;

async function getAsr(): Promise<Asr> {
  if (!loading) {
    loading = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = process.env.EMOTION_MODEL_CACHE ?? './.cache/transformers';
      const model = process.env.WHISPER_MODEL ?? DEFAULT_MODEL;
      const asr = await pipeline('automatic-speech-recognition', model, { dtype: 'q8' });
      return asr as unknown as Asr;
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export function wordTimestampsEnabled(): boolean {
  return process.env.WORD_TIMESTAMPS !== 'off';
}

/**
 * Returns one timing per whitespace-separated word of `text`, aligned to what Whisper heard
 * in `wav`. Throws if the model can't run; callers should fall back to estimates.
 */
export async function extractWordTimestamps(wav: Buffer, text: string): Promise<WordTiming[]> {
  const words = tokenizeWords(text);
  if (words.length === 0) return [];

  const { samples, sampleRate } = decodeWav(wav);
  const audio = resample(samples, sampleRate, WHISPER_RATE);
  const duration = audio.length / WHISPER_RATE;

  const asr = await getAsr();
  const result = await asr(audio, { return_timestamps: 'word', chunk_length_s: 30 });
  const recognised: RecognisedWord[] = (result.chunks ?? [])
    .filter((c) => c.text.trim().length > 0)
    .map((c, i, arr) => ({
      text: c.text,
      start: c.timestamp[0],
      end: c.timestamp[1] ?? arr[i + 1]?.timestamp[0] ?? duration,
    }));

  return alignWords(words, recognised, duration);
}
