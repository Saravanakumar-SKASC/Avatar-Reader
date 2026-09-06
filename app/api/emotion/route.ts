import { NextRequest, NextResponse } from 'next/server';
import { classifyLocal } from '@/lib/emotion/classify-local';
import { classifyOpenAI, openAiAvailable } from '@/lib/emotion/classify-openai';

export const runtime = 'nodejs';
export const maxDuration = 120; // first call may download the local model

const MAX_SENTENCES = 200;

export async function POST(req: NextRequest) {
  let body: { sentences?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  const sentences = Array.isArray(body.sentences) ? body.sentences.filter((s) => typeof s === 'string') : null;
  if (!sentences) return NextResponse.json({ error: 'Missing "sentences"' }, { status: 400 });
  if (sentences.length > MAX_SENTENCES) {
    return NextResponse.json({ error: `Too many sentences (max ${MAX_SENTENCES})` }, { status: 400 });
  }

  try {
    if (openAiAvailable()) {
      try {
        const labels = await classifyOpenAI(sentences);
        return NextResponse.json({ labels, engine: 'openai' });
      } catch (err) {
        console.warn('[emotion] OpenAI failed, falling back to local:', err instanceof Error ? err.message : err);
      }
    }
    const labels = await classifyLocal(sentences);
    return NextResponse.json({ labels, engine: 'local' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Emotion classification failed: ${msg}` }, { status: 500 });
  }
}
