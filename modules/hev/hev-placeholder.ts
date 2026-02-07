// TODO: This module will implement HEV v1.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md`.
// - Keep changes atomic and versionable.

import { hevDistilBertModelLoader } from './hev-model-loader';

export type HGIIntent = {
   semantic_core: string;
   emotional_context: {
      primary_emotion: string;
      secondary_emotions: string[];
      intensity: number;
      valence: number;
   };
   clarity_score: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidHGIIntent(value: unknown): value is HGIIntent {
   if (!isPlainObject(value)) return false;
   const ec = value.emotional_context;
   if (!isPlainObject(ec)) return false;
   return (
      typeof value.semantic_core === 'string' &&
      typeof ec.primary_emotion === 'string' &&
      Array.isArray(ec.secondary_emotions) &&
      ec.secondary_emotions.every((x) => typeof x === 'string') &&
      typeof ec.intensity === 'number' &&
      Number.isFinite(ec.intensity) &&
      typeof ec.valence === 'number' &&
      Number.isFinite(ec.valence) &&
      typeof value.clarity_score === 'number' &&
      Number.isFinite(value.clarity_score)
   );
}

export enum HEVErrorCode {
   VALIDATION_ERROR = 'VALIDATION_ERROR',
   INVALID_STRUCTURE = 'INVALID_STRUCTURE',
   INVALID_SCORE = 'INVALID_SCORE',
   RANGE_VIOLATION = 'RANGE_VIOLATION',
   ETHICAL_VIOLATION = 'ETHICAL_VIOLATION',
   EVALUATE_STUB_FAIL = 'EVALUATE_STUB_FAIL',
   GRADIENT_MISMATCH = 'GRADIENT_MISMATCH',
   PIPELINE_INCOMPATIBLE = 'PIPELINE_INCOMPATIBLE',
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
 * Creates a {@link HEVError} representing a deterministic evaluation stub failure.
 *
 * Use this when a structure-only placeholder is expected to return deterministic
 * data but fails internal structural invariants.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
 */
export function createHEVStubError(details?: unknown, cause?: unknown): HEVError {
   return createHEVValidationError(
      HEVErrorCode.EVALUATE_STUB_FAIL,
      'HEV evaluate stub failed structural invariants.',
      details,
      cause,
   );
}

/**
 * Creates a {@link HEVError} representing an ethical gradient mismatch.
 *
 * Use this when a computed or assigned ethical gradient is structurally
 * incompatible with the expected {@link EthicalGradient} output.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
 */
export function createHEVGradientError(details?: unknown, cause?: unknown): HEVError {
   return createHEVValidationError(
      HEVErrorCode.GRADIENT_MISMATCH,
      'HEV ethical gradient failed structural invariants.',
      details,
      cause,
   );
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

export interface HEVValidationResult {
   ok: boolean;
   errors: string[];
}

/**
 * Structured validator for {@link HEVScore}.
 *
 * This performs structure and range validation only. It does not compute any
 * ethical scoring.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
 *
 * @param score - Candidate score object.
 * @returns A structured validation result.
 */
export function validateHEVScore(score: unknown): HEVValidationResult {
   const errors: string[] = [];

   if (!isValidHEVScore(score)) {
      return { ok: false, errors: ['HEVScore failed structural validation.'] };
   }

   const metrics: Array<[string, number]> = [
      ['clarity_score', score.clarity_score],
      ['coherence_score', score.coherence_score],
      ['vulnerability_score', score.vulnerability_score],
      ['toxicity_score', score.toxicity_score],
   ];

   for (const [field, value] of metrics) {
      if (!Number.isFinite(value)) {
         errors.push(`${field} must be a finite number`);
         continue;
      }
      if (value < HEV_METRIC_MIN || value > HEV_METRIC_MAX) {
         errors.push(`${field} must be within ${HEV_METRIC_MIN}..${HEV_METRIC_MAX}`);
      }
   }

   return { ok: errors.length === 0, errors };
}

function buildHEVScoreStub(intent: HGIIntent): HEVScore {
   const clarity = clampHEVMetric(0.8);
   const coherence = clampHEVMetric(0.7);
   const vulnerability = clampHEVMetric(intent.emotional_context.intensity);
   const toxicity = clampHEVMetric(1 - clampHEVMetric(intent.clarity_score));

   return {
      clarity_score: clarity,
      coherence_score: coherence,
      vulnerability_score: vulnerability,
      toxicity_score: toxicity,
      ethical_color: EthicalGradient.GREEN_SAFE,
   };
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

export async function compute_ethical_gradient(intent: HGIIntent): Promise<EthicalGradient> {
   // TODO(HGI): STRUCTURE ONLY
   // TODO(HGI): NO SCORING LOGIC
   // TODO(HGI): Compute ethical gradient (color spectrum) for intent
   // Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
   void intent;
   throw new Error("Not implemented");
}

/**
 * Evaluate an intent payload and produce a deterministic {@link HEVScore}.
 *
 * Structure-only placeholder:
 * - Validates the incoming intent using {@link isValidHGIIntent}
 * - Returns a deterministic score scaffold
 * - Clamps all metric fields using {@link clampHEVMetric}
 *
 * No ethical reasoning, scoring computation, or policy logic is implemented.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
 *
 * @param intent - Upstream intent.
 * @returns A validated {@link HEVScore}.
 * @throws {HEVError} When input or output validation fails.
 */
export async function hev_evaluate(intent: HGIIntent): Promise<HEVScore> {
   // TODO(HGI): STRUCTURE ONLY
   // TODO(HGI): NO SCORING LOGIC
   // TODO(HGI): Implement ethical evaluation and return HEVScore
   // Reference: /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
   if (!isValidHGIIntent(intent)) {
      throw createHEVValidationError(
         HEVErrorCode.PIPELINE_INCOMPATIBLE,
         'Invalid intent input for HEV evaluation.',
      );
   }

   const intensity = intent.emotional_context.intensity;
   if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
      throw createHEVValidationError(
         HEVErrorCode.RANGE_VIOLATION,
         'intent emotional_context.intensity out of range (expected 0..1).',
         { field: 'emotional_context.intensity', value: intensity, min: 0, max: 1 },
      );
   }

   const valence = intent.emotional_context.valence;
   if (!Number.isFinite(valence) || valence < -1 || valence > 1) {
      throw createHEVValidationError(
         HEVErrorCode.RANGE_VIOLATION,
         'intent emotional_context.valence out of range (expected -1..1).',
         { field: 'emotional_context.valence', value: valence, min: -1, max: 1 },
      );
   }

   const clarityScore = intent.clarity_score;
   if (!Number.isFinite(clarityScore) || clarityScore < 0 || clarityScore > 1) {
      throw createHEVValidationError(
         HEVErrorCode.RANGE_VIOLATION,
         'intent clarity_score out of range (expected 0..1).',
         { field: 'clarity_score', value: clarityScore, min: 0, max: 1 },
      );
   }

   const text = [
      intent.semantic_core,
      intent.emotional_context.primary_emotion,
      ...intent.emotional_context.secondary_emotions,
   ]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join(' ');

   let toxicityScore = clampHEVMetric(1 - clampHEVMetric(intent.clarity_score));
   let coherenceScore = clampHEVMetric(intent.clarity_score);

   const out = await hevDistilBertModelLoader.infer(text, { executionProviders: ['cuda', 'cpu'] });
   toxicityScore = clampHEVMetric(out.toxicityScore);
   coherenceScore = clampHEVMetric(0.65 * clampHEVMetric(intent.clarity_score) + 0.35 * clampHEVMetric(out.coherenceScore));

   const score: HEVScore = {
      clarity_score: clampHEVMetric(intent.clarity_score),
      coherence_score: coherenceScore,
      vulnerability_score: clampHEVMetric(intent.emotional_context.intensity),
      toxicity_score: toxicityScore,
      ethical_color: EthicalGradient.GREEN_SAFE,
   };

   const normalized = normalizeHEVScore(score);

   const normalizedValidation = validateHEVScore(normalized);
   if (!normalizedValidation.ok) {
      throw createHEVStubError({ errors: normalizedValidation.errors, score: normalized });
   }

   const assignedColor =
      normalized.toxicity_score >= 0.7
         ? EthicalGradient.RED_HIGH_RISK
         : normalized.toxicity_score >= 0.4 || normalized.vulnerability_score >= 0.8
            ? EthicalGradient.YELLOW_CAUTION
            : EthicalGradient.GREEN_SAFE;

   const colored: HEVScore = { ...normalized, ethical_color: assignedColor };
   const coloredValidation = validateHEVScore(colored);
   if (!coloredValidation.ok) {
      throw createHEVGradientError({ errors: coloredValidation.errors, score: colored });
   }

   return colored;
}

/**
 * Pipeline adapter entry for HEV.
 *
 * Structure-only adapter:
 * - Validates an unknown payload as an intent payload
 * - Normalizes by cloning the validated structure
 * - Calls {@link hev_evaluate}
 * - Validates and normalizes the returned {@link HEVScore}
 *
 * Reference:
 * - /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 * - /docs/core/hgi-core-v0.2-outline.md (Section IX: Consenso Ético)
 *
 * @param input - Unknown upstream pipeline payload.
 * @returns A validated {@link HEVScore}.
 * @throws {HEVError} When input or output validation fails.
 */
export async function hev_pipeline_entry(input: unknown): Promise<HEVScore> {
   if (!isValidHGIIntent(input)) {
      throw createHEVValidationError(
         HEVErrorCode.PIPELINE_INCOMPATIBLE,
         'Invalid intent input for HEV pipeline entry.',
      );
   }

   const normalizedIntent: HGIIntent = {
      semantic_core: input.semantic_core,
      emotional_context: {
         primary_emotion: input.emotional_context.primary_emotion,
         secondary_emotions: [...input.emotional_context.secondary_emotions],
         intensity: input.emotional_context.intensity,
         valence: input.emotional_context.valence,
      },
      clarity_score: input.clarity_score,
   };

   const score = await hev_evaluate(normalizedIntent);

   const validation = validateHEVScore(score);
   if (!validation.ok) {
      throw createHEVStubError({ errors: validation.errors, score });
   }

   const normalizedScore = normalizeHEVScore(score);
   const normalizedValidation = validateHEVScore(normalizedScore);
   if (!normalizedValidation.ok) {
      throw createHEVStubError({ errors: normalizedValidation.errors, score: normalizedScore });
   }

   return normalizedScore;
}

export {};
