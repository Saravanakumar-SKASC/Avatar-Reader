// Server-only. Runs the self-hosted Piper binary; zero cost, no account.

import { spawn } from 'child_process';
import { access, readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { homedir, tmpdir } from 'os';
import path from 'path';

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(homedir(), p.slice(1)) : p;
}

export function piperModelPath(voice: string): string {
  const dir = expandHome(process.env.PIPER_VOICES_DIR ?? '~/piper-voices');
  return path.join(dir, `${voice}.onnx`);
}

export async function synthesizeWithPiper(
  text: string,
  voice: string,
  speaker?: number
): Promise<Buffer> {
  const bin = expandHome(process.env.PIPER_PATH ?? 'piper');
  const model = piperModelPath(voice);
  const outPath = path.join(tmpdir(), `${randomUUID()}.wav`);

  try {
    await access(model);
  } catch {
    throw new Error(`Piper voice model not found: ${model} (see SETUP.md to download it)`);
  }

  const args = ['--model', model, '--output_file', outPath];
  if (speaker !== undefined) args.push('--speaker', String(speaker));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args);
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (err) => reject(new Error(`Piper failed to start (${bin}): ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Piper exited with code ${code}: ${stderr.trim()}`));
    });
    child.stdin.write(text);
    child.stdin.end();
  });

  try {
    return await readFile(outPath);
  } finally {
    await unlink(outPath).catch(() => {});
  }
}
