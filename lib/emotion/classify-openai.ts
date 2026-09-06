// Server-only. Optional higher-accuracy path; used only when OPENAI_API_KEY is set.
// Plain fetch against the Chat Completions API with a strict JSON schema — no SDK.

import { EMOTIONS, type Emotion, type SentenceEmotion } from './types';

const MODEL = process.env.OPENAI_EMOTION_MODEL ?? 'gpt-4o-mini';

export function openAiAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function classifyOpenAI(sentences: string[]): Promise<SentenceEmotion[]> {
  if (sentences.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You label the emotional tone a narrator should show while reading each sentence aloud. ' +
            `Allowed emotions: ${[...EMOTIONS, 'neutral'].join(', ')}. ` +
            'Use neutral for factual or flat sentences. Return one item per input sentence, in order.',
        },
        { role: 'user', content: JSON.stringify(sentences) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'sentence_emotions',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    emotion: { type: 'string', enum: [...EMOTIONS, 'neutral'] },
                    score: { type: 'number', description: 'confidence 0..1' },
                  },
                  required: ['emotion', 'score'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI classification failed: ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(data.choices[0]?.message.content ?? '{"items":[]}') as {
    items: { emotion: Emotion; score: number }[];
  };
  // Pad/truncate defensively so the timeline builder always gets one label per sentence.
  return sentences.map((_, i) => {
    const it = parsed.items[i];
    return it ? { emotion: it.emotion, score: Math.max(0, Math.min(1, it.score)) } : { emotion: 'neutral', score: 0 };
  });
}
