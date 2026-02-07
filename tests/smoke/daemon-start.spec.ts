import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollStatus(port: number, timeoutMs = 10_000): Promise<unknown> {
  const url = `http://localhost:${port}/status`;
  const start = Date.now();
  let lastErr: unknown = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as unknown;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(200);
  }

  throw lastErr instanceof Error ? lastErr : new Error('Timed out waiting for daemon /status');
}

function spawnNodeStart(env: NodeJS.ProcessEnv) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm -s node-start'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
  }

  return spawn('pnpm', ['-s', 'node-start'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
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

test('daemon-start smoke: spawn pnpm node-start and respond to /status', async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);

  process.env.HGI_DAEMON_PORT = String(port);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HGI_DAEMON_PORT: String(port),
    HGI_DAEMON_INSECURE: '1',
    MESH_LIBP2P_SMOKE: '1',
  };

  const child = spawnNodeStart(env);
  assert.ok(typeof child.pid === 'number' && child.pid > 0);

  try {
    const status = await pollStatus(port, 10_000);
    assert.ok(typeof status === 'object' && status !== null);
  } finally {
    await killTree(child.pid!);
  }
});
