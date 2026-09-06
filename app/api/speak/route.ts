import { NextRequest, NextResponse } from 'next/server';
import { synthesizeWithFish } from '@/lib/tts/fish';
import { synthesizeWithPiper } from '@/lib/tts/piper';
import { extractVisemes } from '@/lib/tts/rhubarb';
import type { SpeakResponse, TtsEngine } from '@/types/tts';

export const runtime = 'nodejs';

// Phase 3: one hardcoded voice. The avatar/voice registry arrives in Phase 5.
// Fish reference_id is a placeholder (see CLAUDE.md); leave empty to use Fish's default voice.
const VOICE = {
  fishReferenceId: '',
  piperVoice: 'en_US-ryan-high',
};

export async function POST(req: NextRequest) {
  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Missing "text"' }, { status: 400 });
  }

  let audio: Buffer;
  let engineUsed: TtsEngine;
  try {
    audio = await synthesizeWithFish(text, VOICE.fishReferenceId);
    engineUsed = 'fish';
  } catch (fishErr) {
    const fishMsg = fishErr instanceof Error ? fishErr.message : String(fishErr);
    console.warn(`[speak] Fish Audio unavailable, falling back to Piper: ${fishMsg}`);
    try {
      audio = await synthesizeWithPiper(text, VOICE.piperVoice);
      engineUsed = 'piper';
    } catch (piperErr) {
      const piperMsg = piperErr instanceof Error ? piperErr.message : String(piperErr);
      return NextResponse.json(
        { error: 'Both TTS engines failed', fish: fishMsg, piper: piperMsg },
        { status: 502 }
      );
    }
  }

  try {
    const visemes = await extractVisemes(audio);
    const body: SpeakResponse = { audioBase64: audio.toString('base64'), visemes, engineUsed };
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, engineUsed }, { status: 500 });
  }
}
