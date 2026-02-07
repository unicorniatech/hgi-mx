import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { NODE_TYPE_WEIGHT, NodeType } from '../../modules/mesh/mesh-placeholder';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, timeoutMs = 1000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

async function poll(url: string, pred: (value: any) => boolean, timeoutMs = 20_000): Promise<any> {
  const start = Date.now();
  let last: any = null;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await fetchJson(url, 1000);
      if (pred(last)) return last;
    } catch {
      // ignore
    }
    await sleep(250);
  }
  return last;
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

test(
  'mesh-gossip smoke: 2 daemons discover peers and receive EmoShard over pubsub (opt-in)',
  { skip: !hasEnv('RUN_MESH_GOSSIP_SMOKE') },
  async () => {
    assert.equal(NODE_TYPE_WEIGHT[NodeType.founder], 1.0);
    assert.ok(NODE_TYPE_WEIGHT[NodeType.elder] > NODE_TYPE_WEIGHT[NodeType.ghost]);

    const basePort = 20000 + Math.floor(Math.random() * 1000);
    const daemonPort1 = basePort;
    const daemonPort2 = basePort + 1;
    const listenPort1 = 9001 + Math.floor(Math.random() * 100);
    const listenPort2 = listenPort1 + 1;

    const key1 = path.join(os.tmpdir(), `hgi-mx-node1-${Date.now()}-${Math.random().toString(16).slice(2)}.key`);
    const key2 = path.join(os.tmpdir(), `hgi-mx-node2-${Date.now()}-${Math.random().toString(16).slice(2)}.key`);

    const env1: NodeJS.ProcessEnv = {
      ...process.env,
      HGI_DAEMON_PORT: String(daemonPort1),
      HGI_DAEMON_INSECURE: '1',
      HGI_LISTEN_PORT: String(listenPort1),
      HGI_NODE_KEY_PATH: key1,
      HGI_ENABLE_MDNS: '0',
    };

    const child1 = spawnDaemon(env1);
    assert.ok(typeof child1.pid === 'number' && child1.pid > 0);

    const status1 = `http://localhost:${daemonPort1}/status`;
    const self1 = `http://localhost:${daemonPort1}/self`;

    let bootstrapList: string[] = [];

    try {
      await poll(status1, (v) => v?.ok === true, 15_000);
      const self = await poll(self1, (v) => v?.ok === true && Array.isArray(v.listen_multiaddrs), 15_000);
      const peerId = self.peer_id as string | null;
      const addrs = self.listen_multiaddrs as string[];
      assert.ok(typeof peerId === 'string' && peerId.length > 0);
      assert.ok(Array.isArray(addrs) && addrs.length > 0);

      bootstrapList = addrs.map((a) => (a.includes('/p2p/') ? a : `${a}/p2p/${peerId}`));

      const env2: NodeJS.ProcessEnv = {
        ...process.env,
        HGI_DAEMON_PORT: String(daemonPort2),
        HGI_DAEMON_INSECURE: '1',
        HGI_LISTEN_PORT: String(listenPort2),
        HGI_NODE_KEY_PATH: key2,
        HGI_ENABLE_MDNS: '0',
        HGI_BOOTSTRAP_NODES: bootstrapList.join(','),
      };

      const child2 = spawnDaemon(env2);
      assert.ok(typeof child2.pid === 'number' && child2.pid > 0);

      const peers2 = `http://localhost:${daemonPort2}/peers`;
      const received2 = `http://localhost:${daemonPort2}/received`;
      const shard1 = `http://localhost:${daemonPort1}/shard`;

      try {
        await poll(`http://localhost:${daemonPort2}/status`, (v) => v?.ok === true, 15_000);

        const peers = await poll(peers2, (v) => v?.ok === true && typeof v.count === 'number' && v.count > 0, 20_000);
        assert.ok(peers.count > 0);

        const shardPayload = {
          emotion_vector: [0.1, 0.2, 0.3],
          intention_core: 'mesh_gossip_smoke',
          ethical_score: {
            clarity_score: 0.8,
            coherence_score: 0.7,
            vulnerability_score: 0.2,
            toxicity_score: 0.1,
            ethical_color: 'GREEN_SAFE',
          },
          bips_envelope: null,
          timestamp: Date.now(),
        };

        const postRes = await fetch(shard1, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(shardPayload),
        });
        assert.ok(postRes.ok);

        const received = await poll(received2, (v) => v?.ok === true && typeof v.count === 'number' && v.count > 0, 20_000);
        assert.ok(received.count > 0);
      } finally {
        await killTree(child2.pid!);
      }
    } finally {
      await killTree(child1.pid!);
    }
  },
);
