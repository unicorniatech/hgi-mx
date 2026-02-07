import fs from 'node:fs/promises';

import { spawn } from 'node:child_process';

import { stdin } from 'node:process';

import { evaFromWavBuffer } from './pipelines/eva';
import { hevFromText } from './pipelines/hev';
import { molieFromText } from './pipelines/molie';

import { createESSEngine } from './ess/ess-engine';
import { createULXEngine, type ULXPacket } from './ulx/ulx-engine';

import { af_pipeline_entry } from './af/af-placeholder';
import { bips_pipeline_entry } from './bips/bips-placeholder';
import { mesh_pipeline_entry } from './mesh/mesh-placeholder';

async function readFileBytes(p: string): Promise<Buffer> {
  const buf = await fs.readFile(p);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

function print(obj: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(obj, null, 2));
}

function tryExtractEssKeyFromPacket(packet: ULXPacket): string | null {
  for (let i = packet.states.length - 1; i >= 0; i -= 1) {
    const frame = packet.states[i];
    if (frame.layer !== 'C6') continue;
    const payload = frame.payload as any;
    const ess = payload?.ess;
    if (ess && typeof ess.shard_id === 'string' && ess.shard_id.length > 0) {
      return ess.shard_id;
    }
  }
  return null;
}

function getDaemonPort(): number {
  const raw = process.env.HGI_DAEMON_PORT;
  if (typeof raw !== 'string') return 7777;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return 7777;
  return Math.floor(n);
}

function getUiProxyPort(): number {
  const raw = process.env.HGI_UI_PORT;
  if (typeof raw !== 'string') return 7700;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return 7700;
  return Math.floor(n);
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 1000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function spawnDaemon(): Promise<number> {
  const isWin = process.platform === 'win32';
  const child = isWin
    ? spawn('cmd.exe', ['/c', 'pnpm', 'daemon'], { stdio: 'inherit', env: process.env })
    : spawn('pnpm', ['daemon'], { stdio: 'inherit', env: process.env });

  return await new Promise<number>((resolve) => {
    child.once('exit', (code) => resolve(typeof code === 'number' ? code : 0));
  });
}

async function spawnUiStart(): Promise<number> {
  const isWin = process.platform === 'win32';
  const args = ['exec', 'concurrently', '-k', '-n', 'proxy,ui', 'pnpm ui-proxy', 'pnpm ui-dev'];
  const child = isWin
    ? spawn('cmd.exe', ['/c', 'pnpm', ...args], { stdio: 'inherit', env: process.env })
    : spawn('pnpm', args, { stdio: 'inherit', env: process.env });

  return await new Promise<number>((resolve) => {
    child.once('exit', (code) => resolve(typeof code === 'number' ? code : 0));
  });
}

async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) {
    throw new Error('Expected JSON input on stdin.');
  }
  return JSON.parse(raw) as unknown;
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  if (cmd === 'eva') {
    const filePath = rest[0];
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('Usage: pnpm eva <file.wav>');
    }
    const buf = await readFileBytes(filePath);
    const out = await evaFromWavBuffer(buf);
    print(out);
    return;
  }

  if (cmd === 'hev') {
    const text = rest.join(' ').trim();
    if (text.length === 0) {
      throw new Error('Usage: pnpm hev "texto"');
    }
    const out = await hevFromText(text);
    print(out);
    return;
  }

  if (cmd === 'molie') {
    const text = rest.join(' ').trim();
    if (text.length === 0) {
      throw new Error('Usage: pnpm molie "texto"');
    }
    const out = await molieFromText(text);
    print(out);
    return;
  }

  if (cmd === 'af') {
    const input = await readStdinJson();
    const out = await af_pipeline_entry(input);
    print(out);
    return;
  }

  if (cmd === 'bips') {
    const input = await readStdinJson();
    const out = await bips_pipeline_entry(input);
    print(out);
    return;
  }

  if (cmd === 'mesh') {
    const input = await readStdinJson();
    const out = await mesh_pipeline_entry(input);
    print(out);
    return;
  }

  if (cmd === 'node-start') {
    const code = await spawnDaemon();
    process.exitCode = code;
    return;
  }

  if (cmd === 'ui-start') {
    const proxyPort = getUiProxyPort();
    const daemonPort = getDaemonPort();

    // eslint-disable-next-line no-console
    console.log('[hgi] ui:', 'http://localhost:3000');
    // eslint-disable-next-line no-console
    console.log('[hgi] proxy:', `http://localhost:${proxyPort}`);
    // eslint-disable-next-line no-console
    console.log('[hgi] daemon:', `http://localhost:${daemonPort}`);

    const code = await spawnUiStart();
    process.exitCode = code;
    return;
  }

  if (cmd === 'node-status') {
    const port = getDaemonPort();
    const url = `http://localhost:${port}/status`;
    try {
      const out = await fetchJsonWithTimeout(url, 1000);
      print(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to query daemon status at ${url}: ${msg}`);
    }
    return;
  }

  if (cmd === 'mesh-peers') {
    const port = getDaemonPort();
    const url = `http://localhost:${port}/peers`;
    try {
      const out = await fetchJsonWithTimeout(url, 1000);
      print(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to query daemon peers at ${url}: ${msg}`);
    }
    return;
  }

  if (cmd === 'ulx-run') {
    const filePath = rest[0];
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('Usage: pnpm ulx-run <file.wav>');
    }

    const wavBytes = await readFileBytes(filePath);
    const ess = createESSEngine();
    const ulx = createULXEngine(ess);
    const packet = await ulx.process(wavBytes);

    const ess_key = tryExtractEssKeyFromPacket(packet);
    print({
      ok: true,
      packet,
      summary: {
        packet_id: packet.packet_id,
        state: packet.state,
        ethical_color: packet.ethical_metadata?.ethical_color ?? null,
        risk_flags: packet.ethical_metadata?.risk_flags ?? [],
        ess_key,
      },
    });
    return;
  }

  if (cmd === 'ess-list') {
    const ess = createESSEngine();
    const ids = await ess.list();
    print({ ok: true, count: ids.length, ids });
    return;
  }

  if (cmd === 'ess-show') {
    const id = rest[0];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Usage: pnpm ess-show <id>');
    }
    const ess = createESSEngine();
    const bundle = await ess.get(id);
    if (bundle === null) {
      print({ ok: false, error: 'not_found', id });
      process.exitCode = 1;
      return;
    }
    print({ ok: true, bundle });
    return;
  }

  throw new Error('Usage: pnpm <eva|hev|molie|af|bips|mesh|ui-start|node-start|node-status|mesh-peers|ulx-run|ess-list|ess-show> ...');
}

main(process.argv.slice(2)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
