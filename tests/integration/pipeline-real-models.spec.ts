import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function maybeSetModelEnvFromBaseSync(): void {
  const base = process.env.MODEL_BASE_PATH ?? './models';

  const evaModel = path.resolve(base, 'eva', 'model.onnx');
  if (!hasEnv('EVA_WAV2VEC2_ONNX_PATH') && fsSync.existsSync(evaModel)) process.env.EVA_WAV2VEC2_ONNX_PATH = evaModel;

  const hevModel = path.resolve(base, 'hev', 'model.onnx');
  if (!hasEnv('HEV_DISTILBERT_ONNX_PATH') && fsSync.existsSync(hevModel)) process.env.HEV_DISTILBERT_ONNX_PATH = hevModel;

  const hevVocab = path.resolve(base, 'hev', 'vocab.txt');
  if (!hasEnv('HEV_DISTILBERT_VOCAB_PATH') && fsSync.existsSync(hevVocab)) process.env.HEV_DISTILBERT_VOCAB_PATH = hevVocab;

  const molieModel = path.resolve(base, 'molie', 'model.onnx');
  if (!hasEnv('MOLIE_PHI3_ONNX_PATH') && fsSync.existsSync(molieModel)) process.env.MOLIE_PHI3_ONNX_PATH = molieModel;

  const molieVocab = path.resolve(base, 'molie', 'vocab.txt');
  if (!hasEnv('MOLIE_PHI3_VOCAB_PATH') && fsSync.existsSync(molieVocab)) process.env.MOLIE_PHI3_VOCAB_PATH = molieVocab;
}

maybeSetModelEnvFromBaseSync();

const hasRealModelEnv =
  hasEnv('EVA_WAV2VEC2_ONNX_PATH') &&
  hasEnv('HEV_DISTILBERT_ONNX_PATH') &&
  hasEnv('HEV_DISTILBERT_VOCAB_PATH') &&
  hasEnv('MOLIE_PHI3_ONNX_PATH') &&
  hasEnv('MOLIE_PHI3_VOCAB_PATH');

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

async function runWithCrossEnv(args: string[], timeoutMs = 180_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const escapeCmdArg = (value: string): string => {
    if (value.length === 0) return '""';
    if (!/[\s"]/g.test(value)) return value;
    return `"${value.replaceAll('"', '""')}"`;
  };

  return await new Promise((resolve, reject) => {
    const envArgs = [
      'PHASE7_REAL_MODELS=1',
      `EVA_WAV2VEC2_ONNX_PATH=${process.env.EVA_WAV2VEC2_ONNX_PATH ?? ''}`,
      `HEV_DISTILBERT_ONNX_PATH=${process.env.HEV_DISTILBERT_ONNX_PATH ?? ''}`,
      `HEV_DISTILBERT_VOCAB_PATH=${process.env.HEV_DISTILBERT_VOCAB_PATH ?? ''}`,
      `MOLIE_PHI3_ONNX_PATH=${process.env.MOLIE_PHI3_ONNX_PATH ?? ''}`,
      `MOLIE_PHI3_VOCAB_PATH=${process.env.MOLIE_PHI3_VOCAB_PATH ?? ''}`,
    ];

    const cmd = ['pnpm', '-s', 'cross-env', ...envArgs, ...args].map(escapeCmdArg).join(' ');

    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', cmd], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } })
        : spawn('pnpm', ['-s', 'cross-env', ...envArgs, ...args], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
          });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d));

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderr: Buffer.concat(stderrChunks).toString('utf8') });
    });
  });
}

test(
  'integration: pipeline-run with real models produces non-trivial embeddings and downstream artifacts',
  { skip: !hasRealModelEnv },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-pipeline-real-'));
    const wavPath = path.join(dir, 'real.wav');

    const seconds = 0.5;
    const n = Math.floor(16_000 * seconds);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / 16_000;
      samples[i] = Math.sin(2 * Math.PI * 220 * t) * 0.2;
    }

    await fs.writeFile(wavPath, writeWav16kMonoFloat32AsPcm16(samples));

    const res = await runWithCrossEnv(['pipeline-run', wavPath]);
    assert.equal(res.code, 0, `pipeline-run failed\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    const outDir = path.resolve('/tmp/hgi');

    const eva = JSON.parse(await fs.readFile(path.join(outDir, 'eva.json'), 'utf8')) as any;
    assert.ok(Array.isArray(eva?.output?.pooled));

    const pooledLen = eva.output.pooled.length as number;
    assert.ok(pooledLen > 50, `expected pooled length > 50, got ${pooledLen}`);
    assert.ok(pooledLen >= 768, `expected pooled length >= 768, got ${pooledLen}`);

    const hev = JSON.parse(await fs.readFile(path.join(outDir, 'hev.json'), 'utf8')) as any;
    assert.ok(typeof hev?.toxicity_score === 'number');
    assert.ok(hev.toxicity_score >= 0 && hev.toxicity_score <= 1);
    assert.ok(typeof hev?.coherence_score === 'number');
    assert.ok(hev.coherence_score >= 0 && hev.coherence_score <= 1);

    const molie = JSON.parse(await fs.readFile(path.join(outDir, 'molie.json'), 'utf8')) as any;
    assert.ok(Array.isArray(molie?.semantic_clusters));
    assert.ok(molie.semantic_clusters.length >= 1);
    for (const c of molie.semantic_clusters) {
      assert.ok(typeof c?.cluster_weight === 'number');
      assert.ok(c.cluster_weight >= 0 && c.cluster_weight <= 1);
    }

    const bips = JSON.parse(await fs.readFile(path.join(outDir, 'bips.json'), 'utf8')) as any;
    assert.ok(typeof bips?.hash_contextual === 'string' && bips.hash_contextual.length >= 16);
  },
);
