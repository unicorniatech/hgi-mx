// TODO: This module will implement ESS (Emo-Shards Storage).
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Reference `/docs/roadmap/roadmap-v1.md` (Sections 2-4) when scoping ESS tasks.
// - Keep changes atomic and versionable.

import type { EmoShard } from '../bips/bips-placeholder';

export interface ESSShardKey {
  shard_id: string;
  hash_contextual: string;
}

export interface ESSPutResult {
  ok: boolean;
  key: ESSShardKey;
  timestamp: number;
}

export interface ESSGetResult {
  ok: boolean;
  shard?: EmoShard;
  timestamp: number;
}

export interface ESSListResult {
  ok: boolean;
  keys: ESSShardKey[];
  timestamp: number;
}

export interface ESSStore {
  put(shard: EmoShard): Promise<ESSPutResult>;
  get(key: ESSShardKey): Promise<ESSGetResult>;
  list(): Promise<ESSListResult>;
}

export class ESSError extends Error {
  public readonly code: string;

  public readonly timestamp: Date;

  public constructor(code: string, message: string, timestamp: Date = new Date()) {
    super(message);
    this.name = 'ESSError';
    this.code = code;
    this.timestamp = timestamp;

    Object.setPrototypeOf(this, ESSError.prototype);
  }
}

export function createESSValidationError(message: string): ESSError {
  return new ESSError('VALIDATION_ERROR', message);
}

export function isValidESSShardKey(value: unknown): value is ESSShardKey {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return false;

  const rec = value as Record<string, unknown>;
  return typeof rec.shard_id === 'string' && typeof rec.hash_contextual === 'string';
}
