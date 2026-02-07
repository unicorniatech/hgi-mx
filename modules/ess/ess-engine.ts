import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import * as blake3 from 'blake3';
import { z } from 'zod';

import { isValidEmoShard, type EmoShard } from '../bips/bips-placeholder';

const DEFAULT_ESS_ROOT = path.resolve(process.cwd(), 'hgi-data', 'ess');
const ESS_TTL_MS = 24 * 60 * 60 * 1000;

const ZEmotionalTimelineEvent = z.object({
  t_ms: z.number().finite().nonnegative(),
  channel: z.string().min(1),
  value: z.number().finite(),
});

const ZSyntheticRepresentationBundle = z.object({
  shard_id: z.string().min(1),
  shard_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  ulx_state_id: z.string().min(1),
  created_at_ms: z.number().finite().nonnegative(),
  expires_at_ms: z.number().finite().nonnegative(),
  synthetic_audio: z.string().min(1),
  emotional_timeline: z.array(ZEmotionalTimelineEvent),
  scene_tags: z.array(z.string()),
});

export type SyntheticRepresentationBundle = z.infer<typeof ZSyntheticRepresentationBundle>;

export class ESSEngine {
  private readonly rootDir: string;

  public constructor(rootDir: string = DEFAULT_ESS_ROOT) {
    this.rootDir = rootDir;
  }

  private shardPath(shardId: string): string {
    return path.join(this.rootDir, `${shardId}.json`);
  }

  private ensureRootDir(): void {
    fsSync.mkdirSync(this.rootDir, { recursive: true });
  }

  private computeShardHash(shard: EmoShard): string {
    const stable = JSON.stringify({
      emotion_vector: shard.emotion_vector,
      intention_core: shard.intention_core,
      ethical_score: shard.ethical_score,
      bips_envelope: shard.bips_envelope,
      timestamp: shard.timestamp,
    });
    return blake3.hash(stable).toString('hex');
  }

  private deriveShardId(shard: EmoShard, shardHash: string): string {
    const fromEnvelope = shard.bips_envelope?.shard_id;
    if (typeof fromEnvelope === 'string' && fromEnvelope.trim().length > 0) return fromEnvelope;
    return shardHash.slice(0, 16);
  }

  private makeSyntheticAudioBase64(sampleRate = 16_000, seconds = 0.5, hz = 440): string {
    const n = Math.max(1, Math.floor(sampleRate * seconds));
    const buf = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      const s = Math.sin(2 * Math.PI * hz * t) * 0.2;
      const pcm = Math.max(-1, Math.min(1, s)) * 32767;
      buf.writeInt16LE(Math.round(pcm), i * 2);
    }
    return buf.toString('base64');
  }

  private deriveSceneTags(shard: EmoShard): string[] {
    const tags = new Set<string>();

    const hashContextual = shard.bips_envelope?.hash_contextual;
    if (typeof hashContextual === 'string' && hashContextual.length > 0) {
      for (let i = 0; i < Math.min(4, Math.floor(hashContextual.length / 8)); i += 1) {
        tags.add(`molie_cluster_${hashContextual.slice(i * 8, i * 8 + 8)}`);
      }
    }

    return [...tags];
  }

  private deriveEmotionalTimeline(shard: EmoShard): Array<z.infer<typeof ZEmotionalTimelineEvent>> {
    const out: Array<z.infer<typeof ZEmotionalTimelineEvent>> = [];
    const base = typeof shard.timestamp === 'number' && Number.isFinite(shard.timestamp) ? shard.timestamp : 0;
    const ev = shard.emotion_vector;

    for (let i = 0; i < ev.length; i += 1) {
      out.push({
        t_ms: base + i * 50,
        channel: `ev_${i}`,
        value: ev[i] ?? 0,
      });
    }

    return out;
  }

  private async readBundleFromFile(filePath: string): Promise<SyntheticRepresentationBundle | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return ZSyntheticRepresentationBundle.parse(parsed);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  private isExpired(bundle: SyntheticRepresentationBundle, nowMs: number): boolean {
    return bundle.expires_at_ms <= nowMs;
  }

  public async put(shard: EmoShard): Promise<SyntheticRepresentationBundle> {
    if (!isValidEmoShard(shard)) {
      throw new Error('Invalid EmoShard');
    }

    this.ensureRootDir();

    const now = Date.now();
    const shard_hash = this.computeShardHash(shard);
    const shard_id = this.deriveShardId(shard, shard_hash);

    const bundle: SyntheticRepresentationBundle = ZSyntheticRepresentationBundle.parse({
      shard_id,
      shard_hash,
      ulx_state_id: `ulx_${shard_hash.slice(0, 16)}`,
      created_at_ms: now,
      expires_at_ms: now + ESS_TTL_MS,
      synthetic_audio: this.makeSyntheticAudioBase64(),
      emotional_timeline: this.deriveEmotionalTimeline(shard),
      scene_tags: this.deriveSceneTags(shard),
    });

    const filePath = this.shardPath(bundle.shard_id);
    await fs.writeFile(filePath, JSON.stringify(bundle, null, 2), 'utf8');
    return bundle;
  }

  public async get(key: string): Promise<SyntheticRepresentationBundle | null> {
    await this.deleteExpired();
    const filePath = this.shardPath(key);
    const bundle = await this.readBundleFromFile(filePath);
    if (!bundle) return null;
    if (this.isExpired(bundle, Date.now())) return null;
    return bundle;
  }

  public async list(): Promise<string[]> {
    await this.deleteExpired();
    this.ensureRootDir();
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const nowMs = Date.now();
    const out: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.json')) continue;

      const shardId = entry.name.slice(0, -'.json'.length);
      const filePath = path.join(this.rootDir, entry.name);

      try {
        const bundle = await this.readBundleFromFile(filePath);
        if (!bundle) continue;
        if (this.isExpired(bundle, nowMs)) continue;
        out.push(shardId);
      } catch {
        // ignore
      }
    }

    out.sort((a, b) => a.localeCompare(b));
    return out;
  }

  public async deleteExpired(nowMs: number = Date.now()): Promise<number> {
    this.ensureRootDir();
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const jsonFiles = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
      .map((e) => path.join(this.rootDir, e.name));

    let deleted = 0;

    for (const filePath of jsonFiles) {
      let item: SyntheticRepresentationBundle | null = null;
      try {
        item = await this.readBundleFromFile(filePath);
      } catch {
        try {
          await fs.unlink(filePath);
          deleted += 1;
        } catch {
          // ignore
        }
        continue;
      }

      if (item && item.expires_at_ms <= nowMs) {
        try {
          await fs.unlink(this.shardPath(item.shard_id));
          deleted += 1;
        } catch {
          // ignore
        }
      }
    }

    return deleted;
  }
}

let singleton: ESSEngine | null = null;

export function createESSEngine(): ESSEngine {
  if (singleton) return singleton;
  singleton = new ESSEngine();
  return singleton;
}
