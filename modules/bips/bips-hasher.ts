import { createRequire } from 'node:module';

import { createHash as createBlake3Hash } from 'blake3';
import argon2 from 'argon2';

import type { HEVScore } from '../hev/hev-placeholder';
import type { MOLIEMap } from '../molie/molie-placeholder';

const BIPS_SIMILARITY_THRESHOLD = 0.15;

type Blake3HashLike = {
  update: (data: Uint8Array) => Blake3HashLike;
  digest: (encoding?: 'hex') => Uint8Array | string;
};

type Blake3Backend = {
  createHash: () => Blake3HashLike;
  backendName: string;
};

const require = createRequire(import.meta.url);

let cachedBlake3Backend: Blake3Backend | null = null;

function gpuSeemsAvailable(): boolean {
  const cuda = process.env.CUDA_VISIBLE_DEVICES;
  const nvidia = process.env.NVIDIA_VISIBLE_DEVICES;
  const force = process.env.BIPS_BLAKE3_GPU;

  if (typeof force === 'string') {
    const v = force.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
  }

  const looksEnabled = (x: string | undefined): boolean => {
    if (typeof x !== 'string') return false;
    const v = x.trim();
    if (v.length === 0) return false;
    if (v.toLowerCase() === 'none') return false;
    if (v === '-1') return false;
    return true;
  };

  return looksEnabled(cuda) || looksEnabled(nvidia);
}

function getBlake3Backend(): Blake3Backend {
  if (cachedBlake3Backend !== null) return cachedBlake3Backend;

  const cpu: Blake3Backend = {
    createHash: () => createBlake3Hash() as unknown as Blake3HashLike,
    backendName: 'cpu:blake3',
  };

  if (!gpuSeemsAvailable()) {
    cachedBlake3Backend = cpu;
    return cachedBlake3Backend;
  }

  const candidates = ['blake3-gpu', '@onnxruntime-node/blake3-gpu', 'blake3-wasm-gpu'];
  for (const name of candidates) {
    try {
      const mod = require(name) as { createHash?: () => Blake3HashLike };
      if (typeof mod?.createHash === 'function') {
        cachedBlake3Backend = { createHash: mod.createHash, backendName: `gpu:${name}` };
        return cachedBlake3Backend;
      }
    } catch {
      // ignore and fall back
    }
  }

  cachedBlake3Backend = cpu;
  return cachedBlake3Backend;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

function blake3Hex(input: Uint8Array): string {
  const h = getBlake3Backend().createHash();
  return h.update(input).digest('hex') as string;
}

function blake3Bytes(input: Uint8Array): Uint8Array {
  const h = getBlake3Backend().createHash();
  return h.update(input).digest() as Uint8Array;
}

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function variance01(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const var0 = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return clamp01(var0);
}

function normalizedByteEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const counts = new Array<number>(256).fill(0);
  for (const b of bytes) counts[b] += 1;

  let h = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const c = counts[i];
    if (c === 0) continue;
    const p = c / bytes.length;
    h -= p * Math.log2(p);
  }

  const max = 8;
  return clamp01(h / max);
}

export interface BIPSHashResult {
  shard_id: string;
  hash_contextual: string;
  entropy_proof: number;
  similarity_score: number;
}

export async function hashContextualEnvelope(molieMap: MOLIEMap, hevScore: HEVScore): Promise<BIPSHashResult> {
  const serialized = stableStringify({ molieMap, hevScore });
  const contextBytes = toBytes(serialized);

  const salt = blake3Bytes(toBytes(`bips:salt:${serialized}`)).slice(0, 16);

  const argonRaw = (await argon2.hash(Buffer.from(contextBytes), {
    type: argon2.argon2id,
    timeCost: 2,
    memoryCost: 1 << 16,
    parallelism: 1,
    hashLength: 32,
    raw: true,
    salt: Buffer.from(salt),
  })) as Buffer;

  const blakeSeedHex = blake3Hex(new Uint8Array(argonRaw));

  const shard_id = blake3Hex(toBytes(`bips:shard:${blakeSeedHex}`)).slice(0, 64);
  const hash_contextual = blake3Hex(toBytes(`bips:ctx:${serialized}:${blakeSeedHex}`)).slice(0, 64);

  const entropy_proof = normalizedByteEntropy(new Uint8Array(argonRaw));

  const clusterWeights = molieMap.semantic_clusters.map((c) => clamp01(c.cluster_weight));
  const nodeWeights = molieMap.intention_nodes.map((n) => clamp01(n.semantic_weight));
  const nodeMean = nodeWeights.length === 0 ? 0 : nodeWeights.reduce((a, b) => a + b, 0) / nodeWeights.length;

  const coherenceProxy = clamp01(hevScore.coherence_score);
  const clarityProxy = clamp01(hevScore.clarity_score);
  const vulnerabilityProxy = clamp01(hevScore.vulnerability_score);
  const nonToxicProxy = clamp01(1 - hevScore.toxicity_score);

  const consistencyVector = [clarityProxy, coherenceProxy, nonToxicProxy, 1 - vulnerabilityProxy, nodeMean, ...clusterWeights].map((x) => clamp01(x));

  const similarity_score = clamp01(variance01(consistencyVector));

  return {
    shard_id,
    hash_contextual,
    entropy_proof: clamp01(entropy_proof),
    similarity_score: clamp01(similarity_score),
  };
}
