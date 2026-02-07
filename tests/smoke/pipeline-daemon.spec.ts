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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, timeoutMs = 1000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function pollOk(url: string, timeoutMs = 10_000): Promise<unknown> {
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      return await fetchJson(url, 1000);
    } catch (err) {
      lastErr = err;
      await sleep(200);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Timed out: ${url}`);
}

function spawnDaemon(env: NodeJS.ProcessEnv) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm -s daemon'], { stdio: ['ignore', 'pipe', 'pipe'], env });
  }
  return spawn('pnpm', ['-s', 'daemon'], { stdio: ['ignore', 'pipe', 'pipe'], env });
}

async function killTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      k.once('close', () => resolve());
      k.once('error', () => resolve());
    });
    return;
  }

  const isAlive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err?.code === 'EPERM';
    }
  };

  const waitForExit = async (timeoutMs: number): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!isAlive()) return true;
      await sleep(100);
    }
    return !isAlive();
  };

  if (!isAlive()) return;

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore
  }

  const exitedAfterTerm = await waitForExit(5_000);
  if (exitedAfterTerm) return;

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore
  }

  await waitForExit(5_000);
}

async function runPnpm(args: string[], env: NodeJS.ProcessEnv, timeoutMs = 120_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
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

test(
  'pipeline-daemon smoke: pipeline-run posts shard and daemon /shards count increases',
  {
    skip:
      !hasEvaModel() ||
      !hasEnv('HEV_DISTILBERT_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_VOCAB_PATH') ||
      !hasEnv('MOLIE_PHI3_ONNX_PATH') ||
      !hasEnv('MOLIE_PHI3_VOCAB_PATH'),
  },
  async () => {
    const port = 19000 + Math.floor(Math.random() * 1000);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HGI_DAEMON_PORT: String(port),
      HGI_DAEMON_INSECURE: '1',
      MESH_LIBP2P_SMOKE: '1',
    };

    const child = spawnDaemon(env);
    assert.ok(typeof child.pid === 'number' && child.pid > 0);

    const statusUrl = `http://localhost:${port}/status`;
    const shardsUrl = `http://localhost:${port}/shards`;

    try {
      await pollOk(statusUrl, 10_000);

      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-pipeline-daemon-'));
      const wavPath = path.join(dir, 'input.wav');

      const seconds = 0.25;
      const n = Math.floor(16_000 * seconds);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        const t = i / 16_000;
        samples[i] = Math.sin(2 * Math.PI * 440 * t) * 0.1;
      }

      await fs.writeFile(wavPath, writeWav16kMonoFloat32AsPcm16(samples));

      const res = await runPnpm(['pipeline-run', wavPath], env, 120_000);
      assert.equal(res.code, 0, `pipeline-run failed\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

      const shards = (await pollOk(shardsUrl, 10_000)) as any;
      assert.ok(typeof shards === 'object' && shards !== null);
      assert.ok(typeof shards.count === 'number');
      assert.ok(shards.count > 0);
    } finally {
      await killTree(child.pid!);
    }
  },
);
