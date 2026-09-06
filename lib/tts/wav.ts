// Streaming TTS services (Fish Audio included) emit WAVs whose RIFF and data chunk
// sizes are 0xFFFFFFFF placeholders because the length is unknown when the header
// is written. Rhubarb refuses such files, so rewrite the sizes from the real length.
// Buffers that already carry correct sizes are returned unchanged.

export function fixWavHeader(input: Buffer): Buffer {
  if (input.length < 12 || input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WAVE') {
    return input;
  }

  const out = Buffer.from(input); // copy so callers' buffers stay untouched
  const riffSize = out.length - 8;
  if (out.readUInt32LE(4) !== riffSize) out.writeUInt32LE(riffSize, 4);

  // Walk chunks to find "data".
  let offset = 12;
  while (offset + 8 <= out.length) {
    const id = out.toString('ascii', offset, offset + 4);
    const declared = out.readUInt32LE(offset + 4);
    if (id === 'data') {
      const actual = out.length - (offset + 8);
      if (declared !== actual) out.writeUInt32LE(actual, offset + 4);
      break;
    }
    offset += 8 + declared + (declared % 2); // chunks are word-aligned
  }
  return out;
}
