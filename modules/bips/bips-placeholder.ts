// TODO: This module will implement BIPS v1.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md` (Section 5: BIPS)
//   and `/docs/protocols/bips-outline.md`.
// - Keep changes atomic and versionable.

import type { ESSIntent } from '../ess/ess-placeholder';
import { HEVScore, isValidHEVScore } from '../hev/hev-placeholder';

/**
 * Narrow an `unknown` value to a plain object record.
 *
 * This helper is intentionally conservative:
 * - Returns `true` only for non-null objects.
 * - Excludes arrays.
 *
 * @param value - The value to check.
 * @returns `true` when `value` is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check whether a value is a finite `number`.
 *
 * @param value - The value to check.
 * @returns `true` when `value` is a `number` and `Number.isFinite(value)`.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Check whether a value is an array of finite numbers.
 *
 * @param value - The value to check.
 * @returns `true` when `value` is a `number[]` and all values are finite.
 */
export function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => isFiniteNumber(item));
}

export const BIPS_SIMILARITY_THRESHOLD = 0.15;

export interface BIPSThresholdResult {
  ok: boolean;
  details?: string;
}

export interface BIPSValidationError {
  code: string;
  field: string;
  message: string;
  value?: string;
}

export interface BIPSValidationResult {
  ok: boolean;
  errors: BIPSValidationError[];
}

/**
 * Stable error codes for BIPS structural/validation failures.
 */
export enum BIPSErrorCode {
  SIMILARITY_VIOLATION = 'SIMILARITY_VIOLATION',
  INVALID_SHARD_ID = 'INVALID_SHARD_ID',
  INVALID_HASH_CONTEXTUAL = 'INVALID_HASH_CONTEXTUAL',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',
}

/**
 * BIPS error type for structural/validation failures.
 *
 * This error class is intended for input/shape/range validation only.
 * It does not implement similarity computation, hashing, or biometric logic.
 */
export class BIPSError extends Error {
  public readonly code: BIPSErrorCode;

  public readonly timestamp: Date;

  /**
   * Create a new {@link BIPSError}.
   *
   * @param code - Stable BIPS error code.
   * @param message - Human-readable message.
   * @param timestamp - Optional timestamp override.
   */
  public constructor(code: BIPSErrorCode, message: string, timestamp: Date = new Date()) {
    super(message);
    this.name = 'BIPSError';
    this.code = code;
    this.timestamp = timestamp;

    // Ensure prototype chain is correct when targeting older JS runtimes.
    Object.setPrototypeOf(this, BIPSError.prototype);
  }
}

/**
 * Factory for a similarity-threshold violation.
 *
 * @param score - The similarity score that was evaluated.
 * @returns A {@link BIPSError} with code {@link BIPSErrorCode.SIMILARITY_VIOLATION}.
 */
export function createBIPSSimilarityError(score: number): BIPSError {
  return new BIPSError(
    BIPSErrorCode.SIMILARITY_VIOLATION,
    `Similarity score must be < ${BIPS_SIMILARITY_THRESHOLD}: ${String(score)}`,
  );
}

/**
 * Factory for an invalid BIPS identifier error.
 *
 * @param idType - The identifier type being validated.
 * @param id - The offending identifier.
 * @returns A {@link BIPSError} with code corresponding to the invalid ID type.
 */
export function createBIPSInvalidIDError(
  idType: 'shard_id' | 'hash_contextual',
  id: string,
): BIPSError {
  const code =
    idType === 'shard_id' ? BIPSErrorCode.INVALID_SHARD_ID : BIPSErrorCode.INVALID_HASH_CONTEXTUAL;
  return new BIPSError(code, `Invalid ${idType}: ${id}`);
}

const BIPS_SHARD_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const BIPS_HASH_CONTEXTUAL_REGEX = /^[a-fA-F0-9]{64}$/;

/**
 * Validate a BIPS shard ID.
 *
 * Format:
 * - Alphanumeric plus `_` and `-`
 * - Length 1-64 characters
 *
 * @param id - The shard ID to validate.
 * @returns `true` when `id` matches the required format.
 */
export function isValidShardID(id: string): boolean {
  return BIPS_SHARD_ID_REGEX.test(id);
}

/**
 * Validate a contextual hash string.
 *
 * Format:
 * - 64 hex characters (case-insensitive)
 *
 * This does not compute or verify any hash; it only validates the format.
 *
 * @param hash - The hash string to validate.
 * @returns `true` when `hash` is a 64-character hex string.
 */
export function isValidHashContextual(hash: string): boolean {
  return BIPS_HASH_CONTEXTUAL_REGEX.test(hash);
}

/**
 * Validate identifier fields used by {@link EmoShard} / {@link IrreversibilityEnvelope}.
 *
 * This performs format validation only:
 * - `bips_envelope.shard_id` must be a valid shard ID.
 * - `bips_envelope.hash_contextual` must be a 64-character hex string.
 *
 * No hashing logic is implemented.
 *
 * @param shard - The shard whose embedded envelope IDs should be validated.
 * @returns A structured validation result.
 */
export function validateEmoShardIDs(shard: EmoShard): BIPSValidationResult {
  const errors: BIPSValidationError[] = [];

  const envelope = shard.bips_envelope;
  if (envelope === null) {
    return { ok: true, errors };
  }

  if (!isValidShardID(envelope.shard_id)) {
    errors.push({
      code: 'INVALID_SHARD_ID',
      field: 'bips_envelope.shard_id',
      message: 'Shard ID must be alphanumeric plus _- and 1-64 characters.',
      value: envelope.shard_id,
    });
  }

  if (!isValidHashContextual(envelope.hash_contextual)) {
    errors.push({
      code: 'INVALID_HASH_CONTEXTUAL',
      field: 'bips_envelope.hash_contextual',
      message: 'hash_contextual must be a 64-character hex string.',
      value: envelope.hash_contextual,
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a similarity score against the BIPS similarity threshold.
 *
 * This does not compute similarity. It only validates the numeric threshold:
 * - Score must be finite
 * - Score must be strictly less than {@link BIPS_SIMILARITY_THRESHOLD}
 *
 * @param score - The similarity score to validate.
 * @returns `true` when score is finite and strictly less than the threshold.
 */
export function isWithinSimilarityThreshold(score: number): boolean {
  return Number.isFinite(score) && score < BIPS_SIMILARITY_THRESHOLD;
}

/**
 * Structured validator for the BIPS similarity threshold.
 *
 * This is a structure-only check that returns a machine-friendly status and an
 * optional human-readable detail.
 *
 * @param score - The similarity score to validate.
 * @returns A {@link BIPSThresholdResult} describing whether the score passes.
 */
export function validateSimilarityThreshold(score: number): BIPSThresholdResult {
  if (!Number.isFinite(score)) {
    return { ok: false, details: `Similarity score must be a finite number: ${String(score)}` };
  }

  if (score >= BIPS_SIMILARITY_THRESHOLD) {
    return {
      ok: false,
      details: `Similarity score must be < ${BIPS_SIMILARITY_THRESHOLD}: ${String(score)}`,
    };
  }

  return { ok: true };
}

/**
 * Runtime validator / type guard for {@link IrreversibilityEnvelope}.
 *
 * This guard validates only the structural shape of the envelope (types of fields).
 * It does not implement hashing, biometrics, or any semantic validation.
 *
 * @param env - The value to validate.
 * @returns `true` when `env` matches the {@link IrreversibilityEnvelope} structure.
 */
export function isValidIrreversibilityEnvelope(env: unknown): env is IrreversibilityEnvelope {
  if (!isRecord(env)) return false;

  return (
    typeof env.shard_id === 'string' &&
    typeof env.hash_contextual === 'string' &&
    isFiniteNumber(env.entropy_proof) &&
    isFiniteNumber(env.similarity_score)
  );
}

/**
 * Runtime validator / type guard for {@link EmoShard}.
 *
 * This guard validates only the structural shape of the shard (types of fields).
 * It does not implement hashing, biometrics, or any semantic validation.
 *
 * @param shard - The value to validate.
 * @returns `true` when `shard` matches the {@link EmoShard} structure.
 */
export function isValidEmoShard(shard: unknown): shard is EmoShard {
  if (!isRecord(shard)) return false;

  const envelope = shard.bips_envelope;

  return (
    isFiniteNumberArray(shard.emotion_vector) &&
    typeof shard.intention_core === 'string' &&
    isValidHEVScore(shard.ethical_score) &&
    (envelope === null || isValidIrreversibilityEnvelope(envelope)) &&
    isFiniteNumber(shard.timestamp)
  );
}

export type BIPSESSIntent = ESSIntent;

export interface IrreversibilityEnvelope {
  shard_id: string;
  hash_contextual: string;
  entropy_proof: number;
  similarity_score: number; // Must be < 0.15
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO HASHING LOGIC
  // TODO(HGI): NO BIOMETRIC OPERATIONS
  // Reference: /docs/protocols/bips-outline.md (Section 2: Proceso de Irreversibilidad)
}

export interface EmoShard {
  emotion_vector: number[];
  intention_core: string;
  ethical_score: HEVScore;
  bips_envelope: IrreversibilityEnvelope | null;
  timestamp: number;
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO HASHING LOGIC
  // TODO(HGI): NO BIOMETRIC OPERATIONS
  // Reference: /docs/protocols/bips-outline.md (Section 2: Proceso de Irreversibilidad)
}

export async function compute_similarity_score(shard: EmoShard): Promise<number> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO HASHING LOGIC
  // TODO(HGI): NO BIOMETRIC OPERATIONS
  // TODO(HGI): Compute biometric entropy similarity score (BES)
  // Reference: /docs/protocols/bips-outline.md (Section 2: Proceso de Irreversibilidad)
  void shard;
  throw new Error("Not implemented");
}

export async function bips_generate(shard: EmoShard): Promise<IrreversibilityEnvelope> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO HASHING LOGIC
  // TODO(HGI): NO BIOMETRIC OPERATIONS
  // TODO(HGI): Implement irreversibility transformation + envelope generation
  // Reference: /docs/protocols/bips-outline.md (Section 2: Proceso de Irreversibilidad)
  void shard;
  throw new Error("Not implemented");
}

export async function bips_validate(shard: EmoShard): Promise<boolean> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO HASHING LOGIC
  // TODO(HGI): NO BIOMETRIC OPERATIONS
  // TODO(HGI): Validate similarity_score < 0.15 threshold
  // Reference: /docs/protocols/bips-outline.md (Section 2: Proceso de Irreversibilidad)
  void shard;
  throw new Error("Not implemented");
}

export {};
