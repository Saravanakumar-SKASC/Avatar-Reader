// Server-only. Never import from a client component.

export async function synthesizeWithFish(text: string, referenceId: string): Promise<Buffer> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) throw new Error('FISH_AUDIO_API_KEY is not set');

  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model: 's2.1-pro-free',
    },
    body: JSON.stringify({
      text,
      // Omit reference_id until a real voice id is filled in, so Fish uses its default voice.
      ...(referenceId ? { reference_id: referenceId } : {}),
      format: 'wav',
    }),
  });
  if (!res.ok) throw new Error(`Fish Audio TTS failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
