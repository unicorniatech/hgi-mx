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

async function runPnpmWithEnv(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs = 120_000,
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
        : spawn('pnpm', ['-s', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env });

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

async function runPnpm(args: string[], timeoutMs = 120_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
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
            env: {
              ...process.env,
            },
          })
        : spawn('pnpm', ['-s', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });

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
  'integration: pipeline-run writes /tmp/hgi/ulx.json',
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
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-pipeline-ulx-'));
    const wavPath = path.join(dir, 'input.wav');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-pipeline-ulx-out-'));

    const seconds = 0.25;
    const n = Math.floor(16_000 * seconds);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / 16_000;
      samples[i] = Math.sin(2 * Math.PI * 440 * t) * 0.1;
    }

    await fs.writeFile(wavPath, writeWav16kMonoFloat32AsPcm16(samples));

    try {
      const res = await runPnpmWithEnv(
        ['pipeline-run', wavPath],
        {
          ...process.env,
          HGI_PIPELINE_OUT_DIR: outDir,
        },
        180_000,
      );
      assert.equal(res.code, 0, `pipeline-run failed\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

      const ulxPath = path.join(outDir, 'ulx.json');
      await fs.access(ulxPath);

      const ulx = JSON.parse(await fs.readFile(ulxPath, 'utf8')) as any;
      assert.ok(typeof ulx?.packet_id === 'string' && ulx.packet_id.length > 0);
      assert.ok(Array.isArray(ulx?.states));
      const layers = ulx.states.map((s: any) => s.layer);
      for (const l of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) {
        assert.ok(layers.includes(l), `missing ${l} frame`);
      }
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  },
);
