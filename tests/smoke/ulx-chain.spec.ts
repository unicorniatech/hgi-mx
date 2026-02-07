import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESSEngine } from '../../modules/ess/ess-engine';
import { createULXEngine } from '../../modules/ulx/ulx-engine';
import { isValidEmoShard } from '../../modules/bips/bips-placeholder';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function hasEvaModel(): boolean {
  const configured = process.env.EVA_WAV2VEC2_ONNX_PATH;
  const modelPath = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), 'models', 'eva', 'model.onnx');
  return fsSync.existsSync(modelPath);
}

function writeWav16kMonoFloat32AsPcm16(samples: Float32Array, sampleRate = 16_000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;

  buf.write('RIFF', o);
  o += 4;
  buf.writeUInt32LE(36 + dataSize, o);
  o += 4;
  buf.write('WAVE', o);
  o += 4;

  buf.write('fmt ', o);
  o += 4;
  buf.writeUInt32LE(16, o);
  o += 4;
  buf.writeUInt16LE(1, o);
  o += 2;
  buf.writeUInt16LE(numChannels, o);
  o += 2;
  buf.writeUInt32LE(sampleRate, o);
  o += 4;
  buf.writeUInt32LE(byteRate, o);
  o += 4;
  buf.writeUInt16LE(blockAlign, o);
  o += 2;
  buf.writeUInt16LE(bitsPerSample, o);
  o += 2;

  buf.write('data', o);
  o += 4;
  buf.writeUInt32LE(dataSize, o);
  o += 4;

  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    const s = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
    buf.writeInt16LE(s, o);
    o += 2;
  }

  return buf;
}

test(
  'ulx-chain smoke: ULX.process generates valid C1-C6 state chain',
  {
    skip:
      !hasEvaModel() ||
      !hasEnv('EVA_WAV2VEC2_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_VOCAB_PATH') ||
      !hasEnv('MOLIE_PHI3_ONNX_PATH') ||
      !hasEnv('MOLIE_PHI3_VOCAB_PATH'),
  },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-ulx-chain-'));
    const essRoot = path.join(dir, 'ess');

    const ess: ESSEngine = new ESSEngine(essRoot);
    const ulx = createULXEngine(ess);

    const seconds = 0.25;
    const n = Math.floor(16_000 * seconds);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / 16_000;
      samples[i] = Math.sin(2 * Math.PI * 440 * t) * 0.1;
    }

    const wav = writeWav16kMonoFloat32AsPcm16(samples);
    const packet = await ulx.process(wav);

    assert.ok(typeof packet.packet_id === 'string' && packet.packet_id.length > 0);
    assert.equal(packet.final, 'RELEASE');
    assert.ok(Array.isArray(packet.states));
    assert.ok(packet.states.length >= 6);

    const layers = packet.states.map((s) => s.layer);
    for (const l of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) {
      assert.ok(layers.includes(l as any), `missing ${l} frame`);
    }

    const c5 = packet.states.find((s) => s.layer === 'C5');
    assert.ok(c5);
    const shard = (c5 as any).payload?.shard;
    assert.ok(isValidEmoShard(shard));

    const c6 = packet.states.find((s) => s.layer === 'C6');
    assert.ok(c6);
    const essShardId = (c6 as any).payload?.ess?.shard_id;
    assert.ok(typeof essShardId === 'string' && essShardId.length > 0);

    const bundle = await ess.get(essShardId);
    assert.ok(bundle);
  },
);
