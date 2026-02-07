import fs from 'node:fs/promises';

export type WavPcm = {
  sampleRate: number;
  channelCount: number;
  pcm: Float32Array;
};

function readU32LE(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}

function readU16LE(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off);
}

function fourCC(buf: Buffer, off: number): string {
  return buf.toString('ascii', off, off + 4);
}

function toMonoInterleavedFloat(samples: Float32Array, channels: number): Float32Array {
  if (channels === 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let acc = 0;
    const base = i * channels;
    for (let c = 0; c < channels; c += 1) {
      acc += samples[base + c] ?? 0;
    }
    mono[i] = acc / channels;
  }
  return mono;
}

function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input;
  if (input.length === 0) return input;

  const ratio = outRate / inRate;
  const outLen = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i += 1) {
    const t = i / ratio;
    const i0 = Math.floor(t);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = t - i0;
    const s0 = input[i0] ?? 0;
    const s1 = input[i1] ?? 0;
    out[i] = s0 + (s1 - s0) * frac;
  }

  return out;
}

export function decodeWav(buffer: Buffer, targetSampleRate = 16_000): WavPcm {
  if (buffer.length < 12) {
    throw new Error('Invalid WAV: too small');
  }
  if (fourCC(buffer, 0) !== 'RIFF' || fourCC(buffer, 8) !== 'WAVE') {
    throw new Error('Invalid WAV: missing RIFF/WAVE header');
  }

  let offset = 12;

  let audioFormat: number | null = null;
  let channelCount: number | null = null;
  let sampleRate: number | null = null;
  let bitsPerSample: number | null = null;
  let dataChunk: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const id = fourCC(buffer, offset);
    const size = readU32LE(buffer, offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(buffer.length, chunkStart + size);

    if (id === 'fmt ') {
      if (chunkEnd - chunkStart < 16) {
        throw new Error('Invalid WAV: fmt chunk too small');
      }
      audioFormat = readU16LE(buffer, chunkStart + 0);
      channelCount = readU16LE(buffer, chunkStart + 2);
      sampleRate = readU32LE(buffer, chunkStart + 4);
      bitsPerSample = readU16LE(buffer, chunkStart + 14);
    } else if (id === 'data') {
      dataChunk = buffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkStart + size;
    if (offset % 2 === 1) offset += 1;
  }

  if (audioFormat === null || channelCount === null || sampleRate === null || bitsPerSample === null) {
    throw new Error('Invalid WAV: missing fmt chunk');
  }
  if (dataChunk === null) {
    throw new Error('Invalid WAV: missing data chunk');
  }

  const channels = channelCount;

  let interleaved: Float32Array;

  if (audioFormat === 1) {
    if (bitsPerSample !== 16) {
      throw new Error(`Unsupported WAV PCM bitsPerSample=${bitsPerSample} (expected 16)`);
    }
    const frames = Math.floor(dataChunk.length / (2 * channels));
    interleaved = new Float32Array(frames * channels);
    for (let i = 0; i < frames * channels; i += 1) {
      const s = dataChunk.readInt16LE(i * 2);
      interleaved[i] = Math.max(-1, Math.min(1, s / 32768));
    }
  } else if (audioFormat === 3) {
    if (bitsPerSample !== 32) {
      throw new Error(`Unsupported WAV float bitsPerSample=${bitsPerSample} (expected 32)`);
    }
    const frames = Math.floor(dataChunk.length / (4 * channels));
    interleaved = new Float32Array(frames * channels);
    for (let i = 0; i < frames * channels; i += 1) {
      interleaved[i] = dataChunk.readFloatLE(i * 4);
    }
  } else {
    throw new Error(`Unsupported WAV format audioFormat=${audioFormat} (expected PCM=1 or Float=3)`);
  }

  const mono = toMonoInterleavedFloat(interleaved, channels);
  const resampled = resampleLinear(mono, sampleRate, targetSampleRate);

  return {
    sampleRate: targetSampleRate,
    channelCount: 1,
    pcm: resampled,
  };
}

export async function readWavFile(filePath: string, targetSampleRate = 16_000): Promise<WavPcm> {
  const buf = await fs.readFile(filePath);
  return decodeWav(buf, targetSampleRate);
}
