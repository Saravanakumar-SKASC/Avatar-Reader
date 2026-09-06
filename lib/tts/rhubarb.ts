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

/**
 * `phonetic` (default) is several times faster than `pocketSphinx` and language-agnostic,
 * at a small cost in accuracy. Override with RHUBARB_RECOGNIZER=pocketSphinx.
 */
function recognizer(): 'phonetic' | 'pocketSphinx' {
  return process.env.RHUBARB_RECOGNIZER === 'pocketSphinx' ? 'pocketSphinx' : 'phonetic';
}

/**
 * @param dialog The spoken text, if known. Rhubarb uses it to improve recognition
 *               (pocketSphinx only; harmless for phonetic).
 */
export async function extractVisemes(audioBuffer: Buffer, dialog?: string): Promise<Viseme[]> {
  const rawBin = process.env.RHUBARB_PATH ?? 'rhubarb';
  const bin = rawBin.startsWith('~') ? path.join(homedir(), rawBin.slice(1)) : rawBin;
  const wavPath = path.join(tmpdir(), `${randomUUID()}.wav`);
  const jsonPath = `${wavPath}.json`;
  const dialogPath = `${wavPath}.txt`;

  await writeFile(wavPath, fixWavHeader(audioBuffer));
  const args = [wavPath, '-f', 'json', '-o', jsonPath, '-r', recognizer()];
  if (dialog && recognizer() === 'pocketSphinx') {
    await writeFile(dialogPath, dialog, 'utf-8');
    args.push('--dialogFile', dialogPath);
  }
  try {
    await execFileAsync(bin, args);
    const raw = JSON.parse(await readFile(jsonPath, 'utf-8')) as { mouthCues: Viseme[] };
    return raw.mouthCues;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Rhubarb failed (${bin}): ${msg}`);
  } finally {
    await Promise.all([wavPath, jsonPath, dialogPath].map((p) => unlink(p).catch(() => {})));
  }
}
