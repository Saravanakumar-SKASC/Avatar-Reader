import { NextRequest, NextResponse } from 'next/server';
import { synthesizeWithFish } from '@/lib/tts/fish';
import { synthesizeWithPiper } from '@/lib/tts/piper';
import { extractVisemes } from '@/lib/tts/rhubarb';
import { extractWordTimestamps, wordTimestampsEnabled } from '@/lib/timing/extract-word-timestamps';
import { AVATARS, DEFAULT_AVATAR_ID, withEmotionTag } from '@/lib/avatars';
import type { SpeakRequest, SpeakResponse, TtsEngine } from '@/types/tts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: Partial<SpeakRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const { text, avatarId = DEFAULT_AVATAR_ID, voiceOverride = '' } = body;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Missing "text"' }, { status: 400 });
  }
  const avatar = AVATARS.find((a) => a.id === avatarId);
  if (!avatar) {
    return NextResponse.json({ error: `Unknown avatarId "${avatarId}"` }, { status: 400 });
  }

  // Fish: avatar's voice (or manual override) + inline emotion tag in the text itself.
  const fishReferenceId = voiceOverride.trim() || avatar.fishReferenceId;
  const fishText = withEmotionTag(avatar.emotionTag, text);

  let audio: Buffer;
  let engineUsed: TtsEngine;
  try {
    audio = await synthesizeWithFish(fishText, fishReferenceId);
    engineUsed = 'fish';
  } catch (fishErr) {
    const fishMsg = fishErr instanceof Error ? fishErr.message : String(fishErr);
    console.warn(`[speak] Fish Audio unavailable, falling back to Piper: ${fishMsg}`);
    try {
      // Piper has no emotion control: plain text, avatar's mapped voice model.
      audio = await synthesizeWithPiper(text, avatar.piperVoice, avatar.piperSpeaker);
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
    // Visemes (Rhubarb) and word timestamps (Whisper) both read the same WAV; run them together.
    // Word timing is best-effort: on failure the client falls back to proportional estimates.
    const [visemes, words] = await Promise.all([
      extractVisemes(audio, text),
      wordTimestampsEnabled()
        ? extractWordTimestamps(audio, text).catch((err) => {
            console.warn('[speak] word timestamps unavailable:', err instanceof Error ? err.message : err);
            return null;
          })
        : Promise.resolve(null),
    ]);
    const res: SpeakResponse = {
      audioBase64: audio.toString('base64'),
      visemes,
      words,
      engineUsed,
      avatarId: avatar.id,
      fishReferenceId: engineUsed === 'fish' ? fishReferenceId : '',
      emotionTag: engineUsed === 'fish' ? avatar.emotionTag : '',
    };
    return NextResponse.json(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, engineUsed }, { status: 500 });
  }
}
