import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { evaWav2Vec2ModelLoader } from '../../modules/eva/eva-model-loader';

function hasEvaModel(): boolean {
  const modelPath = path.resolve(process.cwd(), 'models', 'eva', 'model.onnx');
  return fsSync.existsSync(modelPath);
}

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

async function maybeSetModelEnvFromBase(): Promise<void> {
  const base = process.env.MODEL_BASE_PATH ?? './models';

  const evaModel = path.resolve(base, 'eva', 'model.onnx');
  if (!hasEnv('EVA_WAV2VEC2_ONNX_PATH') && fsSync.existsSync(evaModel)) {
    process.env.EVA_WAV2VEC2_ONNX_PATH = evaModel;
  }

  const hevModel = path.resolve(base, 'hev', 'model.onnx');
  if (!hasEnv('HEV_DISTILBERT_ONNX_PATH') && fsSync.existsSync(hevModel)) {
    process.env.HEV_DISTILBERT_ONNX_PATH = hevModel;
  }

  const hevVocab = path.resolve(base, 'hev', 'vocab.txt');
  if (!hasEnv('HEV_DISTILBERT_VOCAB_PATH') && fsSync.existsSync(hevVocab)) {
    process.env.HEV_DISTILBERT_VOCAB_PATH = hevVocab;
  }

  const molieModel = path.resolve(base, 'molie', 'model.onnx');
  if (!hasEnv('MOLIE_PHI3_ONNX_PATH') && fsSync.existsSync(molieModel)) {
    process.env.MOLIE_PHI3_ONNX_PATH = molieModel;
  }

  const molieVocab = path.resolve(base, 'molie', 'vocab.txt');
  if (!hasEnv('MOLIE_PHI3_VOCAB_PATH') && fsSync.existsSync(molieVocab)) {
    process.env.MOLIE_PHI3_VOCAB_PATH = molieVocab;
  }
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

async function runPnpm(
  args: string[],
  timeoutMs = 60_000,
  env: NodeJS.ProcessEnv = { ...process.env },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const escapeCmdArg = (value: string): string => {
      if (value.length === 0) return '""';
      if (!/[\s"]/g.test(value)) return value;
      return `"${value.replaceAll('"', '""')}"`;
    };

    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', ['pnpm', '-s', ...args].map(escapeCmdArg).join(' ')], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
          })
        : spawn('pnpm', ['-s', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`pnpm ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d));

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

test(
  'pipeline-run smoke: creates /tmp/hgi/*.json artifacts with expected shapes',
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
  await maybeSetModelEnvFromBase();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-pipeline-run-'));
  const wavPath = path.join(dir, 'input.wav');
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-pipeline-out-'));

  const seconds = 0.25;
  const n = Math.floor(16_000 * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / 16_000;
    samples[i] = Math.sin(2 * Math.PI * 440 * t) * 0.1;
  }

  await fs.writeFile(wavPath, writeWav16kMonoFloat32AsPcm16(samples));

  try {
    const res = await runPnpm(['pipeline-run', wavPath], 120_000, {
      ...process.env,
      HGI_PIPELINE_OUT_DIR: outDir,
    });
    assert.equal(res.code, 0, `pipeline-run failed\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    const paths = {
      eva: path.join(outDir, 'eva.json'),
      af: path.join(outDir, 'af.json'),
      hev: path.join(outDir, 'hev.json'),
      molie: path.join(outDir, 'molie.json'),
      bips: path.join(outDir, 'bips.json'),
      mesh: path.join(outDir, 'mesh.json'),
    };

    for (const p of Object.values(paths)) {
      await fs.access(p);
    }

    const eva = JSON.parse(await fs.readFile(paths.eva, 'utf8')) as any;
    assert.ok(typeof eva === 'object' && eva !== null);
    assert.ok(typeof eva.modelPath === 'string');
    assert.ok(typeof eva.output?.outputName === 'string');
    assert.ok(Array.isArray(eva.output?.pooled));

    const pooled = Float32Array.from(eva.output.pooled);
    assert.ok(pooled.length >= 768, `expected pooled embeddings length >=768, got ${pooled.length}`);

    const evaVector = evaWav2Vec2ModelLoader.embeddingsToProsody(pooled);
    assert.ok(Number.isFinite(evaVector.pitch_mean) && evaVector.pitch_mean > 0);
    assert.ok(Number.isFinite(evaVector.pitch_variance) && evaVector.pitch_variance > 0);
    assert.ok(Number.isFinite(evaVector.energy_mean) && evaVector.energy_mean > 0);
    assert.ok(Array.isArray(evaVector.rhythm_features));
    assert.ok(evaVector.rhythm_features.length >= 8);
    assert.ok(evaVector.rhythm_features.some((v) => Number.isFinite(v) && Math.abs(v) > 0));

    const af = JSON.parse(await fs.readFile(paths.af, 'utf8')) as any;
    assert.ok(typeof af?.intent?.semantic_core === 'string');
    assert.ok(typeof af?.intent?.emotional_context?.primary_emotion === 'string');
    assert.ok(typeof af?.intent?.emotional_context?.valence === 'number');

    const hev = JSON.parse(await fs.readFile(paths.hev, 'utf8')) as any;
    assert.ok(typeof hev?.clarity_score === 'number');
    assert.ok(typeof hev?.coherence_score === 'number');
    assert.ok(typeof hev?.toxicity_score === 'number');

    const molie = JSON.parse(await fs.readFile(paths.molie, 'utf8')) as any;
    assert.ok(Array.isArray(molie?.intention_nodes));
    assert.ok(Array.isArray(molie?.semantic_clusters));

    const bips = JSON.parse(await fs.readFile(paths.bips, 'utf8')) as any;
    assert.ok(typeof bips?.hash_contextual === 'string');
    assert.ok(typeof bips?.shard_id === 'string');

    const mesh = JSON.parse(await fs.readFile(paths.mesh, 'utf8')) as any;
    assert.ok(typeof mesh?.node_id === 'string');
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
  },
);
