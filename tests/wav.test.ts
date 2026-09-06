import { describe, expect, it } from 'vitest';
import { fixWavHeader } from '../lib/tts/wav';

function wav(riffSize: number, dataSize: number, samples: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(riffSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(88200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(samples * 2)]);
}

describe('fixWavHeader', () => {
  it('rewrites streaming placeholder sizes with real lengths', () => {
    const fixed = fixWavHeader(wav(0xffffffff, 0xffffffff, 100));
    expect(fixed.readUInt32LE(4)).toBe(fixed.length - 8);
    expect(fixed.readUInt32LE(40)).toBe(200);
  });

  it('leaves a correct header alone', () => {
    const good = wav(36 + 200, 200, 100);
    expect(fixWavHeader(good).equals(good)).toBe(true);
  });

  it('returns non-WAV data untouched', () => {
    const notWav = Buffer.from('ID3 definitely not a wav');
    expect(fixWavHeader(notWav)).toBe(notWav);
  });
});
