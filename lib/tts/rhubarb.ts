// Server-only. Runs Rhubarb Lip Sync on a WAV buffer to get mouth-cue timings.

import { execFile } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { homedir, tmpdir } from 'os';
import path from 'path';
import type { Viseme } from '@/types/tts';
import { fixWavHeader } from './wav';

const execFileAsync = promisify(execFile);

export async function extractVisemes(audioBuffer: Buffer): Promise<Viseme[]> {
  const rawBin = process.env.RHUBARB_PATH ?? 'rhubarb';
  const bin = rawBin.startsWith('~') ? path.join(homedir(), rawBin.slice(1)) : rawBin;
  const wavPath = path.join(tmpdir(), `${randomUUID()}.wav`);
  const jsonPath = `${wavPath}.json`;

  await writeFile(wavPath, fixWavHeader(audioBuffer));
  try {
    await execFileAsync(bin, [wavPath, '-f', 'json', '-o', jsonPath]);
    const raw = JSON.parse(await readFile(jsonPath, 'utf-8')) as { mouthCues: Viseme[] };
    return raw.mouthCues;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Rhubarb failed (${bin}): ${msg}`);
  } finally {
    await Promise.all([unlink(wavPath).catch(() => {}), unlink(jsonPath).catch(() => {})]);
  }
}
