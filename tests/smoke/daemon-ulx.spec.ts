import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 1000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.text();
    const json = body.length ? (JSON.parse(body) as any) : null;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function pollOk(url: string, timeoutMs = 10_000): Promise<any> {
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      return await fetchJson(url, undefined, 1000);
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

test('daemon-ulx smoke: POST ULXPacket records metadata and stores shard when gate passes', async () => {
  const port = 21000 + Math.floor(Math.random() * 1000);

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
  const ulxUrl = `http://localhost:${port}/ulx-received`;
  const postUrl = `http://localhost:${port}/shard`;

  try {
    await pollOk(statusUrl, 10_000);

    const beforeUlx = await fetchJson(ulxUrl);
    const beforeShards = await fetchJson(shardsUrl);

    const now = Date.now();

    const packet = {
      protocol: 'ulx/1.0.0',
      packet_type: 'RELEASE',
      state: 'RELEASE',
      packet_id: `test_${String(now)}`,
      timestamp_ms: now,
      ethical_metadata: {
        ethical_color: 'green_safe',
        risk_flags: [],
      },
      states: [
        { layer: 'C1', version: '1.0.0', message_id: 'm1', sender_node_id: 'local', timestamp: now, payload: { eva: { pitch_mean: 1, pitch_variance: 1, energy_mean: 1, rhythm_features: [1] } } },
        { layer: 'C2', version: '1.0.0', message_id: 'm2', sender_node_id: 'local', timestamp: now, payload: { intent: { semantic_core: 'x', emotional_context: { primary_emotion: 'y', secondary_emotions: [], intensity: 0.1, valence: 0.1 }, clarity_score: 0.5 } } },
        { layer: 'C3', version: '1.0.0', message_id: 'm3', sender_node_id: 'local', timestamp: now, payload: {} },
        { layer: 'C4', version: '1.0.0', message_id: 'm4', sender_node_id: 'local', timestamp: now, payload: { ethical_metadata: { ethical_color: 'green_safe', risk_flags: [] } } },
        {
          layer: 'C5',
          version: '1.0.0',
          message_id: 'm5',
          sender_node_id: 'local',
          timestamp: now,
          payload: {
            shard: {
              emotion_vector: [0.1, 0.2],
              intention_core: 'hello',
              ethical_score: {
                clarity_score: 0.9,
                coherence_score: 0.9,
                vulnerability_score: 0.1,
                toxicity_score: 0.1,
                ethical_color: 'green_safe',
              },
              bips_envelope: {
                shard_id: 'testshard',
                hash_contextual: '0123456789abcdef0123456789abcdef',
                entropy_proof: 0.4,
                similarity_score: 0.05,
              },
              timestamp: now,
            },
          },
        },
        { layer: 'C6', version: '1.0.0', message_id: 'm6', sender_node_id: 'local', timestamp: now, payload: { ess: { shard_id: 'testshard', shard_hash: 'a'.repeat(64), ulx_state_id: 'ulx_test' } } },
      ],
      final: 'RELEASE',
    };

    const postRes = await fetchJson(
      postUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hgi-role': 'founder',
          'x-hgi-pubkey': 'x',
          'x-hgi-signature': 'x',
        },
        body: JSON.stringify(packet),
      },
      5_000,
    );

    assert.equal(postRes.ok, true);

    const afterUlx = await fetchJson(ulxUrl);
    const afterShards = await fetchJson(shardsUrl);

    assert.ok(typeof afterUlx?.count === 'number');
    assert.ok(afterUlx.count >= (beforeUlx?.count ?? 0) + 1);

    assert.ok(typeof afterShards?.count === 'number');
    assert.ok(afterShards.count >= (beforeShards?.count ?? 0) + 1);
  } finally {
    await killTree(child.pid!);
  }
});

test(
  'daemon-ulx smoke: ULX metadata is gossiped to peers (opt-in)',
  { skip: !hasEnv('RUN_MESH_GOSSIP_SMOKE') },
  async () => {
    const basePort = 22000 + Math.floor(Math.random() * 1000);
    const daemonPort1 = basePort;
    const daemonPort2 = basePort + 1;
    const listenPort1 = 9101 + Math.floor(Math.random() * 200);
    const listenPort2 = listenPort1 + 1;

    const key1 = path.join(os.tmpdir(), `hgi-mx-ulx-node1-${Date.now()}-${Math.random().toString(16).slice(2)}.key`);
    const key2 = path.join(os.tmpdir(), `hgi-mx-ulx-node2-${Date.now()}-${Math.random().toString(16).slice(2)}.key`);

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

    try {
      await pollOk(`http://localhost:${daemonPort1}/status`, 15_000);

      const self1 = await fetchJson(`http://localhost:${daemonPort1}/self`, undefined, 2_000);
      const peerId = self1?.peer_id as string | null;
      const addrs = self1?.listen_multiaddrs as string[] | null;
      assert.ok(typeof peerId === 'string' && peerId.length > 0);
      assert.ok(Array.isArray(addrs) && addrs.length > 0);

      const bootstrapList = addrs.map((a) => (a.includes('/p2p/') ? a : `${a}/p2p/${peerId}`));

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

      try {
        await pollOk(`http://localhost:${daemonPort2}/status`, 15_000);

        const peers2 = `http://localhost:${daemonPort2}/peers`;
        const start = Date.now();
        while (Date.now() - start < 20_000) {
          try {
            const peers = await fetchJson(peers2, undefined, 2_000);
            if (typeof peers?.count === 'number' && peers.count > 0) break;
          } catch {
            // ignore
          }
          await sleep(250);
        }

        const received2 = `http://localhost:${daemonPort2}/ulx-received`;
        const before = await fetchJson(received2, undefined, 2_000);
        const beforeCount = typeof before?.count === 'number' ? before.count : 0;

        const now = Date.now();
        const packet = {
          protocol: 'ulx/1.0.0',
          packet_type: 'RELEASE',
          state: 'RELEASE',
          packet_id: `gossip_${String(now)}`,
          timestamp_ms: now,
          ethical_metadata: {
            ethical_color: 'green_safe',
            risk_flags: [],
          },
          states: [
            { layer: 'C1', version: '1.0.0', message_id: 'm1', sender_node_id: 'local', timestamp: now, payload: { eva: { pitch_mean: 1, pitch_variance: 1, energy_mean: 1, rhythm_features: [1] } } },
            { layer: 'C2', version: '1.0.0', message_id: 'm2', sender_node_id: 'local', timestamp: now, payload: { intent: { semantic_core: 'x', emotional_context: { primary_emotion: 'y', secondary_emotions: [], intensity: 0.1, valence: 0.1 }, clarity_score: 0.5 } } },
            { layer: 'C3', version: '1.0.0', message_id: 'm3', sender_node_id: 'local', timestamp: now, payload: {} },
            { layer: 'C4', version: '1.0.0', message_id: 'm4', sender_node_id: 'local', timestamp: now, payload: { ethical_metadata: { ethical_color: 'green_safe', risk_flags: [] } } },
            {
              layer: 'C5',
              version: '1.0.0',
              message_id: 'm5',
              sender_node_id: 'local',
              timestamp: now,
              payload: {
                shard: {
                  emotion_vector: [0.1, 0.2],
                  intention_core: 'hello',
                  ethical_score: {
                    clarity_score: 0.9,
                    coherence_score: 0.9,
                    vulnerability_score: 0.1,
                    toxicity_score: 0.1,
                    ethical_color: 'green_safe',
                  },
                  bips_envelope: {
                    shard_id: 'testshard',
                    hash_contextual: '0123456789abcdef0123456789abcdef',
                    entropy_proof: 0.4,
                    similarity_score: 0.05,
                  },
                  timestamp: now,
                },
              },
            },
            { layer: 'C6', version: '1.0.0', message_id: 'm6', sender_node_id: 'local', timestamp: now, payload: { ess: { shard_id: 'testshard', shard_hash: 'a'.repeat(64), ulx_state_id: 'ulx_test' } } },
          ],
          final: 'RELEASE',
        };

        const postUrl = `http://localhost:${daemonPort1}/shard`;
        const postRes = await fetchJson(
          postUrl,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-hgi-role': 'founder',
              'x-hgi-pubkey': 'x',
              'x-hgi-signature': 'x',
            },
            body: JSON.stringify(packet),
          },
          5_000,
        );
        assert.equal(postRes.ok, true);

        const waitStart = Date.now();
        let afterCount = beforeCount;
        while (Date.now() - waitStart < 20_000) {
          const after = await fetchJson(received2, undefined, 2_000);
          afterCount = typeof after?.count === 'number' ? after.count : 0;
          if (afterCount > beforeCount) break;
          await sleep(250);
        }

        assert.ok(afterCount > beforeCount, `expected ulx-received count to increase (before=${beforeCount} after=${afterCount})`);
      } finally {
        await killTree(child2.pid!);
      }
    } finally {
      await killTree(child1.pid!);
    }
  },
);
