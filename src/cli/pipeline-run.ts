import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

import { evaFromWavBuffer } from '../../modules/pipelines/eva.js';
import type { EVAVector } from '../../modules/eva/eva-placeholder.js';
import { evaWav2Vec2ModelLoader } from '../../modules/eva/eva-model-loader.js';

import { af_pipeline_entry } from '../../modules/af/af-placeholder.js';

import { hev_pipeline_entry } from '../../modules/hev/hev-placeholder.js';

import { molie_pipeline_entry } from '../../modules/molie/molie-placeholder.js';

import type { EmoShard } from '../../modules/bips/bips-placeholder.js';
import { bips_handoff } from '../../modules/bips/bips-placeholder.js';

import { createESSEngine } from '../../modules/ess/ess-engine.js';
import { createULXEngine, ULXEthicalGateError, type ULXPacket } from '../../modules/ulx/ulx-engine.js';

import { mesh_pipeline_entry } from '../../modules/mesh/mesh-placeholder.js';

import { meshLibp2pAdapter } from '../../modules/mesh/mesh-libp2p-adapter.js';

async function readFileBytes(p: string): Promise<Buffer> {
  const buf = await fs.readFile(p);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

async function postUlxToDaemon(packet: ULXPacket): Promise<void> {
  const port = getDaemonPort();
  const url = `http://localhost:${port}/shard`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(packet),
      signal: controller.signal,
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`daemon /shard returned ${res.status}; ULXPacket not ingested (daemon may require auth headers)`);
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`daemon not reachable at ${url}; skipping ULXPacket POST`);
    void err;
  } finally {
    clearTimeout(timeout);
  }
}

async function writeJson(p: string, obj: unknown): Promise<void> {
  const s = JSON.stringify(obj, null, 2);
  await fs.writeFile(p, s, 'utf8');
}

function getDaemonPort(): number {
  const raw = process.env.HGI_DAEMON_PORT;
  if (typeof raw !== 'string') return 7777;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return 7777;
  return Math.floor(n);
}

function getPipelineOutDir(): string {
  const raw = process.env.HGI_PIPELINE_OUT_DIR;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return path.resolve('/tmp/hgi');
  }
  return path.resolve(raw.trim());
}

async function postShardToDaemon(shard: EmoShard): Promise<void> {
  const port = getDaemonPort();
  const url = `http://localhost:${port}/shard`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(shard),
      signal: controller.signal,
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`daemon /shard returned ${res.status}; shard not ingested (daemon may require auth headers)`);
      return;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`daemon not reachable at ${url}; skipping shard POST`);
    void err;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(argv: string[]): Promise<void> {
  const filePath = argv[0];
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('Usage: pnpm pipeline-run <file.wav>');
  }

  const tmpDir = getPipelineOutDir();
  fsSync.mkdirSync(tmpDir, { recursive: true });

  const wavBytes = await readFileBytes(filePath);

  const evaRaw = await evaFromWavBuffer(wavBytes);
  await writeJson(path.join(tmpDir, 'eva.json'), evaRaw);

  const evaVector: EVAVector = evaWav2Vec2ModelLoader.embeddingsToProsody(Float32Array.from(evaRaw.output.pooled));

  const afOut = await af_pipeline_entry({ eva_vector: evaVector, timestamp: Date.now() });
  await writeJson(path.join(tmpDir, 'af.json'), afOut);

  const intent = afOut.intent;

  const hevScore = await hev_pipeline_entry(intent);
  await writeJson(path.join(tmpDir, 'hev.json'), hevScore);

  const molieMap = await molie_pipeline_entry(intent);
  await writeJson(path.join(tmpDir, 'molie.json'), molieMap);

  const shard = await bips_handoff(molieMap, hevScore);
  shard.timestamp = Date.now();
  const envelope = shard.bips_envelope;
  if (envelope === null) {
    throw new Error('BIPS handoff produced shard with null bips_envelope');
  }
  await writeJson(path.join(tmpDir, 'bips.json'), envelope);

  const essEngine = createESSEngine();
  const ulxEngine = createULXEngine(essEngine);

  let ulxPacket: ULXPacket | null = null;
  try {
    ulxPacket = await ulxEngine.process(wavBytes);
    await writeJson(path.join(tmpDir, 'ulx.json'), ulxPacket);
    await postUlxToDaemon(ulxPacket);
  } catch (err) {
    ulxPacket = null;
    if (err instanceof ULXEthicalGateError || (err instanceof Error && err.message.includes('ULX ethical gate failed'))) {
      // eslint-disable-next-line no-console
      console.error(err instanceof Error ? err.message : String(err));
      throw err;
    }

    await postShardToDaemon(shard);
    void err;
  }

  const meshNode = await mesh_pipeline_entry(envelope);
  await writeJson(path.join(tmpDir, 'mesh.json'), meshNode);

  const summary = {
    emotion: intent.emotional_context.primary_emotion,
    valence: intent.emotional_context.valence,
    ethical_score: hevScore,
    shard_hash: envelope.hash_contextual,
    node_id: meshNode.node_id,
    ulx_state: ulxPacket?.state ?? null,
    ess_key: ulxPacket ? (ulxPacket.states.find((f) => f.layer === 'C6') as any)?.payload?.ess?.shard_id ?? null : null,
    peers_connected: meshLibp2pAdapter.getDiscoveredPeerCount(),
  };

  // eslint-disable-next-line no-console
  console.log(
    [
      `emotion=${String(summary.emotion)}`,
      `valence=${String(summary.valence)}`,
      `pitch_mean=${String(evaVector.pitch_mean)}`,
      `pitch_variance=${String(evaVector.pitch_variance)}`,
      `energy_mean=${String(evaVector.energy_mean)}`,
      `ethical_color=${String((hevScore as { ethical_color?: unknown }).ethical_color)}`,
      `clarity_score=${String((hevScore as { clarity_score?: unknown }).clarity_score)}`,
      `coherence_score=${String((hevScore as { coherence_score?: unknown }).coherence_score)}`,
      `vulnerability_score=${String((hevScore as { vulnerability_score?: unknown }).vulnerability_score)}`,
      `toxicity_score=${String((hevScore as { toxicity_score?: unknown }).toxicity_score)}`,
      `shard_hash=${String(summary.shard_hash)}`,
      `node_id=${String(summary.node_id)}`,
      `ulx_state=${String(summary.ulx_state)}`,
      `ess_key=${String(summary.ess_key)}`,
      `peers_connected=${String(summary.peers_connected)}`,
      `tmp_dir=${tmpDir}`,
    ].join('\n'),
  );
}

main(process.argv.slice(2)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
