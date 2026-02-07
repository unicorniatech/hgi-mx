import * as blake3 from 'blake3';
import { z } from 'zod';

import { evaFromWavBuffer } from '../pipelines/eva.js';
import { evaWav2Vec2ModelLoader } from '../eva/eva-model-loader.js';

import { af_pipeline_entry } from '../af/af-placeholder.js';
import { EthicalGradient, hev_pipeline_entry, type HEVScore } from '../hev/hev-placeholder.js';
import { molie_pipeline_entry, type MOLIEMap } from '../molie/molie-placeholder.js';

import { bips_handoff, type EmoShard } from '../bips/bips-placeholder.js';

import type { ESSEngine, SyntheticRepresentationBundle } from '../ess/ess-engine.js';

import type { ULXFrame } from './ulx-placeholder';

const ULX_PROTOCOL = 'ulx/1.0.0';
const ULX_VERSION = '1.0.0';

const ZEVAVector = z.object({
  pitch_mean: z.number().finite(),
  pitch_variance: z.number().finite(),
  energy_mean: z.number().finite(),
  rhythm_features: z.array(z.number().finite()),
});

const ZAFOutput = z.object({
  intent: z.object({
    semantic_core: z.string(),
    emotional_context: z.object({
      primary_emotion: z.string(),
      secondary_emotions: z.array(z.string()),
      intensity: z.number().finite(),
      valence: z.number().finite(),
    }),
    clarity_score: z.number().finite(),
  }),
});

const ZHEVScore = z.object({
  clarity_score: z.number().finite(),
  coherence_score: z.number().finite(),
  vulnerability_score: z.number().finite(),
  toxicity_score: z.number().finite(),
  ethical_color: z.nativeEnum(EthicalGradient),
});

const ZMOLIEMap = z.object({
  intention_nodes: z.array(
    z.object({
      id: z.string(),
      semantic_weight: z.number().finite(),
      emotional_anchor: z.string(),
      connections: z.array(z.string()),
    }),
  ),
  semantic_clusters: z.array(
    z.object({
      id: z.string(),
      node_ids: z.array(z.string()),
      cluster_weight: z.number().finite(),
    }),
  ),
  narrative_threads: z.array(z.string()),
});

const ZEmoShard = z.object({
  emotion_vector: z.array(z.number().finite()),
  intention_core: z.string(),
  ethical_score: ZHEVScore,
  bips_envelope: z
    .object({
      shard_id: z.string(),
      hash_contextual: z.string(),
      entropy_proof: z.number().finite(),
      similarity_score: z.number().finite(),
    })
    .nullable(),
  timestamp: z.number().finite(),
});

const ZSyntheticRepresentationBundle = z.object({
  shard_id: z.string().min(1),
  shard_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  ulx_state_id: z.string().min(1),
  created_at_ms: z.number().finite().nonnegative(),
  expires_at_ms: z.number().finite().nonnegative(),
  synthetic_audio: z.string().min(1),
  emotional_timeline: z.array(
    z.object({
      t_ms: z.number().finite().nonnegative(),
      channel: z.string().min(1),
      value: z.number().finite(),
    }),
  ),
  scene_tags: z.array(z.string()),
});

export type ULXPacketType =
  | 'STATE'
  | 'INTENT'
  | 'ETHICS'
  | 'SYNC_REQUEST'
  | 'SYNC_RESPONSE'
  | 'CONSENSUS_PROPOSAL'
  | 'CONSENSUS_VOTE'
  | 'RELEASE';

export type ULXState = 'INIT' | 'LISTEN' | 'SYNC' | 'CLEANSE' | 'SYNTH' | 'CONSENSUS' | 'RELEASE';

export type ULXPayload =
  | { kind: 'AFIntent'; value: z.infer<typeof ZAFOutput>['intent'] }
  | { kind: 'HEVScore'; value: z.infer<typeof ZHEVScore> };

export type ULXPacket = {
  protocol: string;
  packet_type: ULXPacketType;
  state: ULXState;
  packet_id: string;
  timestamp_ms: number;
  payload?: ULXPayload;
  ethical_metadata: {
    ethical_color?: string;
    risk_flags?: string[];
    constraints?: Record<string, unknown>;
  };
  states: ULXFrame[];
  final: 'RELEASE';
};

export class ULXEthicalGateError extends Error {
  public readonly risk_flags: string[];

  public constructor(risk_flags: string[]) {
    super(`ULX ethical gate failed: ${risk_flags.join(',')}`);
    this.name = 'ULXEthicalGateError';
    this.risk_flags = [...risk_flags];
    Object.setPrototypeOf(this, ULXEthicalGateError.prototype);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

function hashHex(value: unknown): string {
  return blake3.hash(stableStringify(value)).toString('hex');
}

function makeFrame(layer: ULXFrame['layer'], sender_node_id: string, payload: unknown): ULXFrame {
  const timestamp = Date.now();
  const message_id = hashHex({ layer, sender_node_id, payload });
  return {
    layer,
    version: ULX_VERSION,
    message_id,
    sender_node_id,
    timestamp,
    payload: JSON.parse(stableStringify(payload)) as unknown,
  };
}

export class ULXEngine {
  private readonly essEngine: ESSEngine;
  private readonly senderNodeId: string;

  public constructor(essEngine: ESSEngine, senderNodeId: string = 'local') {
    this.essEngine = essEngine;
    this.senderNodeId = senderNodeId;
  }

  public async process(wavBuffer: Buffer): Promise<ULXPacket> {
    const states: ULXFrame[] = [];

    const evaRaw = await evaFromWavBuffer(wavBuffer);
    const evaVector = evaWav2Vec2ModelLoader.embeddingsToProsody(Float32Array.from(evaRaw.output.pooled));
    const c1 = ZEVAVector.parse(evaVector);
    states.push(makeFrame('C1', this.senderNodeId, { eva: c1 }));

    const afOut = await af_pipeline_entry({ eva_vector: c1, timestamp: Date.now() });
    const c2 = ZAFOutput.parse(afOut);
    states.push(makeFrame('C2', this.senderNodeId, { intent: c2.intent }));

    const hevScore = await hev_pipeline_entry(c2.intent);
    const molieMap = await molie_pipeline_entry(c2.intent);

    const hev: HEVScore = ZHEVScore.parse(hevScore) as HEVScore;
    const molie: MOLIEMap = ZMOLIEMap.parse(molieMap) as MOLIEMap;
    const c3 = {
      hev,
      molie,
    };
    states.push(makeFrame('C3', this.senderNodeId, c3));

    const ethical_color = c3.hev.ethical_color;
    const toxicity = c3.hev.toxicity_score;
    const risk_flags: string[] = [];
    if (typeof ethical_color === 'string' && ethical_color.toUpperCase().includes('RED')) risk_flags.push('HEV_RED');
    if (Number.isFinite(toxicity) && toxicity >= 0.7) risk_flags.push('TOXICITY_HIGH');

    if (risk_flags.length > 0) {
      throw new ULXEthicalGateError(risk_flags);
    }

    states.push(
      makeFrame('C4', this.senderNodeId, {
        ethical_metadata: {
          ethical_color,
          risk_flags,
        },
      }),
    );

    const shard: EmoShard = await bips_handoff(c3.molie, c3.hev);
    shard.timestamp = Date.now();
    const c5 = ZEmoShard.parse(shard);
    if (c5.bips_envelope === null) {
      throw new Error('ULX bips_handoff produced shard with null bips_envelope');
    }
    states.push(makeFrame('C5', this.senderNodeId, { shard: c5 }));

    const bundle = await this.essEngine.put(shard);
    const c6 = ZSyntheticRepresentationBundle.parse(bundle as SyntheticRepresentationBundle);
    states.push(makeFrame('C6', this.senderNodeId, { ess: c6 }));

    const packetPayload: ULXPayload = { kind: 'AFIntent', value: c2.intent };

    const packetMaterial = {
      protocol: ULX_PROTOCOL,
      packet_type: 'RELEASE',
      state: 'RELEASE',
      payload: packetPayload,
      ethical_metadata: {
        ethical_color,
        risk_flags,
      },
      ess: {
        shard_id: c6.shard_id,
        shard_hash: c6.shard_hash,
        ulx_state_id: c6.ulx_state_id,
      },
      states,
    };

    const packet_id = hashHex(packetMaterial).slice(0, 32);

    return {
      protocol: ULX_PROTOCOL,
      packet_type: 'RELEASE',
      state: 'RELEASE',
      packet_id,
      timestamp_ms: Date.now(),
      payload: packetPayload,
      ethical_metadata: {
        ethical_color,
        risk_flags,
      },
      states,
      final: 'RELEASE',
    };
  }
}

export function createULXEngine(essEngine: ESSEngine): ULXEngine {
  return new ULXEngine(essEngine);
}
