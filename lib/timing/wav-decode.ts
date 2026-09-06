// Server-only. Minimal PCM WAV reader + linear resampler for feeding Whisper (16 kHz mono).

export interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
}

export function decodeWav(buf: Buffer): DecodedWav {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = 16000;
  let bits = 16;
  let format = 1;
  let data: Buffer | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      // Streaming WAVs carry a placeholder size; take everything that's there.
      data = buf.subarray(body, Math.min(buf.length, size === 0xffffffff ? buf.length : body + size));
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!data) throw new Error('WAV has no data chunk');
  if (format !== 1 && format !== 3) throw new Error(`Unsupported WAV format ${format}`);

  const bytes = bits / 8;
  const frames = Math.floor(data.length / bytes / channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = (i * channels + c) * bytes;
      if (format === 3) sum += data.readFloatLE(at);
      else if (bits === 16) sum += data.readInt16LE(at) / 32768;
      else if (bits === 32) sum += data.readInt32LE(at) / 2147483648;
      else if (bits === 8) sum += (data.readUInt8(at) - 128) / 128;
      else if (bits === 24) sum += ((data.readUInt8(at) | (data.readUInt8(at + 1) << 8) | (data.readInt8(at + 2) << 16)) << 8) / 2147483648;
    }
    samples[i] = sum / channels;
  }
  return { samples, sampleRate };
}

export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const n = Math.round((x.length * to) / from);
  const y = new Float32Array(n);
  const r = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * r;
    const j = Math.floor(p);
    const f = p - j;
    const a = x[j] ?? 0;
    const b = x[Math.min(j + 1, x.length - 1)] ?? a;
    y[i] = a * (1 - f) + b * f;
  }
  return y;
}
