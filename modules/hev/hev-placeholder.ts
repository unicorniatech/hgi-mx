// TODO: This module will implement HEV v1.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md`.
// - Keep changes atomic and versionable.

import { ESSIntent } from '../ess/ess-placeholder';

export enum HEVErrorCode {
   VALIDATION_ERROR = 'VALIDATION_ERROR',
   INVALID_STRUCTURE = 'INVALID_STRUCTURE',
   INVALID_SCORE = 'INVALID_SCORE',
   RANGE_VIOLATION = 'RANGE_VIOLATION',
   ETHICAL_VIOLATION = 'ETHICAL_VIOLATION',
}

/**
 * HEV-scoped error type.
 *
 * This is infrastructure only and does not implement any HEV scoring or
 * ethical evaluation logic.
 */
export class HEVError extends Error {
   /** A machine-readable error code for programmatic handling. */
   public readonly code: HEVErrorCode;

   /** ISO-8601 timestamp of when the error instance was created. */
   public readonly timestamp: string;

   /** Optional additional context for debugging/telemetry. */
   public readonly details?: unknown;

   constructor(code: HEVErrorCode, message: string, options?: { details?: unknown; cause?: unknown }) {
      super(message, { cause: options?.cause });
      this.name = 'HEVError';
      this.code = code;
      this.timestamp = new Date().toISOString();
      this.details = options?.details;
      Object.setPrototypeOf(this, HEVError.prototype);
   }
}

/**
 * Creates a {@link HEVError} representing a HEV validation failure.
 *
 * Prefer using more specific factories (e.g. {@link createHEVRangeError}) when
 * you have a clear code.
 */
export function createHEVValidationError(
   code: HEVErrorCode,
   message: string,
   details?: unknown,
   cause?: unknown,
): HEVError {
   return new HEVError(code, message, { details, cause });
}

/**
 * Creates a {@link HEVError} indicating a numeric range violation.
 */
export function createHEVRangeError(
   field: string,
   value: unknown,
   min: number,
   max: number,
   details?: unknown,
   cause?: unknown,
): HEVError {
   return createHEVValidationError(
      HEVErrorCode.RANGE_VIOLATION,
      `Range violation for ${field}: ${String(value)} (expected ${min}..${max})`,
      {
         field,
         value,
         min,
         max,
         details,
      },
      cause,
   );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return isPlainObject(value);
}

function isFiniteNumber(value: unknown): value is number {
   return typeof value === 'number' && Number.isFinite(value);
}

export const HEV_METRIC_MIN = 0.0;
export const HEV_METRIC_MAX = 1.0;

function clampToRange(value: number, min: number, max: number): number {
   if (!Number.isFinite(value)) return min;
   return Math.min(max, Math.max(min, value));
}

/**
 * Clamps an HEV metric into the allowed range.
 *
 * Range: [{@link HEV_METRIC_MIN}, {@link HEV_METRIC_MAX}]
 */
export function clampHEVMetric(value: number): number {
   return clampToRange(value, HEV_METRIC_MIN, HEV_METRIC_MAX);
}

export enum EthicalGradient {
   GREEN_SAFE = 'green_safe',
   YELLOW_CAUTION = 'yellow_caution',
   RED_HIGH_RISK = 'red_high_risk',
}

const ETHICAL_GRADIENT_TO_STRING: Record<EthicalGradient, string> = {
   [EthicalGradient.GREEN_SAFE]: 'green_safe',
   [EthicalGradient.YELLOW_CAUTION]: 'yellow_caution',
   [EthicalGradient.RED_HIGH_RISK]: 'red_high_risk',
};

const STRING_TO_ETHICAL_GRADIENT: Readonly<Record<string, EthicalGradient>> = Object.freeze(
   Object.fromEntries(
      Object.entries(ETHICAL_GRADIENT_TO_STRING).map(([key, value]) => [value, key as EthicalGradient]),
   ) as Record<string, EthicalGradient>,
);

/**
 * Serializes an {@link EthicalGradient} into its canonical string representation.
 */
export function gradientToString(grad: EthicalGradient): string {
   return ETHICAL_GRADIENT_TO_STRING[grad];
}

/**
 * Parses a string into an {@link EthicalGradient}.
 *
 * - Trims whitespace
 * - Lowercases the input
 *
 * @throws {Error} If the input is not a recognized ethical gradient.
 */
export function stringToGradient(value: string): EthicalGradient {
   const normalized = value.trim().toLowerCase();
   const grad = STRING_TO_ETHICAL_GRADIENT[normalized];
   if (grad === undefined) {
      throw new Error(`Invalid EthicalGradient: ${value}`);
   }
   return grad;
}

/**
 * Type guard for {@link EthicalGradient}.
 *
 * Accepts a string value and validates that it maps to a known
 * {@link EthicalGradient}.
 */
export function isValidEthicalGradient(grad: string): grad is EthicalGradient {
   const normalized = grad.trim().toLowerCase();
   return STRING_TO_ETHICAL_GRADIENT[normalized] !== undefined;
}

export interface HEVScore {
   clarity_score: number; // 0.0 - 1.0
   coherence_score: number; // 0.0 - 1.0
   vulnerability_score: number; // 0.0 - 1.0
   toxicity_score: number; // 0.0 - 1.0
   ethical_color: EthicalGradient;
   // TODO(HGI): STRUCTURE ONLY
   // TODO(HGI): NO SCORING LOGIC
   // Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
 }

/**
 * Type guard for {@link HEVScore}.
 *
 * Validates that the value is a plain object containing:
 * - `clarity_score`, `coherence_score`, `vulnerability_score`, `toxicity_score`: finite numbers
 * - `ethical_color`: {@link EthicalGradient}
 */
export function isValidHEVScore(score: unknown): score is HEVScore {
   if (!isRecord(score)) return false;

   const ethicalColor = (score as Record<string, unknown>).ethical_color;

   return (
      isFiniteNumber((score as Record<string, unknown>).clarity_score) &&
      isFiniteNumber((score as Record<string, unknown>).coherence_score) &&
      isFiniteNumber((score as Record<string, unknown>).vulnerability_score) &&
      isFiniteNumber((score as Record<string, unknown>).toxicity_score) &&
      typeof ethicalColor === 'string' &&
      isValidEthicalGradient(ethicalColor)
   );
}

/**
 * Returns a copy of {@link HEVScore} with all metric fields clamped into the
 * allowed range.
 *
 * This is a range utility only; it does not compute or infer any scoring.
 */
export function normalizeHEVScore(score: HEVScore): HEVScore {
   return {
      ...score,
      clarity_score: clampHEVMetric(score.clarity_score),
      coherence_score: clampHEVMetric(score.coherence_score),
      vulnerability_score: clampHEVMetric(score.vulnerability_score),
      toxicity_score: clampHEVMetric(score.toxicity_score),
   };
}

export async function compute_ethical_gradient(intent: ESSIntent): Promise<EthicalGradient> {
   // TODO(HGI): STRUCTURE ONLY
   // TODO(HGI): NO SCORING LOGIC
   // TODO(HGI): Compute ethical gradient (color spectrum) for intent
   // Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
   void intent;
   throw new Error("Not implemented");
 }

export async function hev_evaluate(intent: ESSIntent): Promise<HEVScore> {
   // TODO(HGI): STRUCTURE ONLY
   // TODO(HGI): NO SCORING LOGIC
   // TODO(HGI): Implement ethical evaluation and return HEVScore
   // Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
   void intent;
   throw new Error("Not implemented");
 }

export {};
