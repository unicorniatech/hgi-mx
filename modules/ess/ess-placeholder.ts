// TODO: This module will implement ESS v1.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md` (Section 4: ESS).
// - Keep changes atomic and versionable.

import { EVAVector, isValidEVAVector, validateEVAVectorShape } from '../eva/eva-placeholder';
import { essMLPModelLoader } from './ess-model-loader';

export enum ESSErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',
  INVALID_EMOTION = 'INVALID_EMOTION',
  RANGE_VIOLATION = 'RANGE_VIOLATION',
  CORE_STUB_FAIL = 'CORE_STUB_FAIL',
  SYNTHESIS_MISMATCH = 'SYNTHESIS_MISMATCH',
  PIPELINE_INCOMPATIBLE = 'PIPELINE_INCOMPATIBLE',
}

/**
 * ESS-scoped error type.
 *
 * This is infrastructure only and does not implement any ESS domain logic.
 */
export class ESSError extends Error {
  /** A machine-readable error code for programmatic handling. */
  public readonly code: ESSErrorCode;

  /** ISO-8601 timestamp of when the error instance was created. */
  public readonly timestamp: string;

  /** Optional additional context for debugging/telemetry. */
  public readonly details?: unknown;

  constructor(code: ESSErrorCode, message: string, options?: { details?: unknown; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'ESSError';
    this.code = code;
    this.timestamp = new Date().toISOString();
    this.details = options?.details;
    Object.setPrototypeOf(this, ESSError.prototype);
  }
}

/**
 * Creates an {@link ESSError} representing an ESS validation failure.
 *
 * Prefer using more specific factories (e.g. {@link createESSInvalidEmotionError})
 * when you have a clear code.
 */
export function createESSValidationError(
  code: ESSErrorCode,
  message: string,
  details?: unknown,
  cause?: unknown,
): ESSError {
  return new ESSError(code, message, { details, cause });
}

/**
 * Creates an {@link ESSError} representing a deterministic core stub failure.
 *
 * Use this when a structure-only placeholder is expected to return deterministic
 * data but fails internal structural invariants.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
 */
export function createESSStubError(details: unknown, cause?: unknown): ESSError {
  return createESSValidationError(
    ESSErrorCode.CORE_STUB_FAIL,
    'ESS core stub failed structural invariants.',
    details,
    cause,
  );
}

/**
 * Creates an {@link ESSError} representing a synthesis mismatch.
 *
 * Use this when ESS intent synthesis fails structural invariants for the
 * expected handoff output.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
 */
export function createESSSynthesisError(details: unknown, cause?: unknown): ESSError {
  return createESSValidationError(
    ESSErrorCode.SYNTHESIS_MISMATCH,
    'ESS synthesis output failed structural invariants.',
    details,
    cause,
  );
}

/**
 * Creates an {@link ESSError} representing an invalid pipeline input payload.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
 */
export function createESSInvalidInputError(message: string, details?: unknown, cause?: unknown): ESSError {
  return createESSValidationError(ESSErrorCode.PIPELINE_INCOMPATIBLE, message, details, cause);
}

/**
 * Creates an {@link ESSError} indicating an invalid or unrecognized emotion.
 */
export function createESSInvalidEmotionError(value: unknown, details?: unknown, cause?: unknown): ESSError {
  return createESSValidationError(
    ESSErrorCode.INVALID_EMOTION,
    `Invalid emotion: ${String(value)}`,
    details,
    cause,
  );
}

/**
 * Creates an {@link ESSError} indicating a numeric range violation.
 */
export function createESSRangeViolationError(
  field: string,
  value: unknown,
  min: number,
  max: number,
  details?: unknown,
  cause?: unknown,
): ESSError {
  return createESSValidationError(
    ESSErrorCode.RANGE_VIOLATION,
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

export enum PrimaryEmotion {
  Joy = 'joy',
  Sadness = 'sadness',
  Anger = 'anger',
  Fear = 'fear',
  Disgust = 'disgust',
  Surprise = 'surprise',
  Trust = 'trust',
  Anticipation = 'anticipation',
}

const PRIMARY_EMOTION_TO_STRING: Record<PrimaryEmotion, string> = {
  [PrimaryEmotion.Joy]: 'joy',
  [PrimaryEmotion.Sadness]: 'sadness',
  [PrimaryEmotion.Anger]: 'anger',
  [PrimaryEmotion.Fear]: 'fear',
  [PrimaryEmotion.Disgust]: 'disgust',
  [PrimaryEmotion.Surprise]: 'surprise',
  [PrimaryEmotion.Trust]: 'trust',
  [PrimaryEmotion.Anticipation]: 'anticipation',
};

const STRING_TO_PRIMARY_EMOTION: Readonly<Record<string, PrimaryEmotion>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PRIMARY_EMOTION_TO_STRING).map(([key, value]) => [value, key as PrimaryEmotion]),
  ) as Record<string, PrimaryEmotion>,
);

/**
 * Serializes a {@link PrimaryEmotion} into its canonical string representation.
 */
export function emotionToString(emotion: PrimaryEmotion): string {
  return PRIMARY_EMOTION_TO_STRING[emotion];
}

/**
 * Parses a string into a {@link PrimaryEmotion}.
 *
 * - Trims whitespace
 * - Lowercases the input
 *
 * @throws {Error} If the input is not a recognized primary emotion.
 */
export function stringToEmotion(value: string): PrimaryEmotion {
  const normalized = value.trim().toLowerCase();
  const emotion = STRING_TO_PRIMARY_EMOTION[normalized];
  if (emotion === undefined) {
    throw new Error(`Invalid PrimaryEmotion: ${value}`);
  }
  return emotion;
}

export const ESS_INTENSITY_MIN = 0.0;
export const ESS_INTENSITY_MAX = 1.0;

export const ESS_VALENCE_MIN = -1.0;
export const ESS_VALENCE_MAX = 1.0;

export const ESS_WEIGHT_MIN = 0.0;
export const ESS_WEIGHT_MAX = 1.0;

function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecordOfFiniteNumbers(value: unknown): value is Record<string, number> {
  if (!isPlainObject(value)) return false;

  for (const v of Object.values(value)) {
    if (!isFiniteNumber(v)) return false;
  }

  return true;
}

export interface EmotionWeights {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO LOGIC IMPLEMENTATION
  primary_emotion_weight: number;
  secondary_emotion_weights: Record<string, number>;
  intensity_weight: number;
  valence_weight: number;
}

export interface ESSEmotion {
  primary_emotion: string;
  secondary_emotions: string[];
  intensity: number; // 0.0 - 1.0
  valence: number; // -1.0 to 1.0
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO LOGIC IMPLEMENTATION
}

export interface ESSIntent {
  semantic_core: string;
  emotional_context: ESSEmotion;
  clarity_score: number;
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO LOGIC IMPLEMENTATION
}

/**
 * Type guard for {@link ESSEmotion}.
 *
 * Validates that the value is a plain object containing:
 * - `primary_emotion`: string
 * - `secondary_emotions`: string[]
 * - `intensity`: finite number
 * - `valence`: finite number
 */
export function isValidESSEmotion(value: unknown): value is ESSEmotion {
  if (!isPlainObject(value)) return false;

  return (
    typeof value.primary_emotion === 'string' &&
    isStringArray(value.secondary_emotions) &&
    isFiniteNumber(value.intensity) &&
    isFiniteNumber(value.valence)
  );
}

/**
 * Type guard for {@link EmotionWeights}.
 *
 * Validates that the value is a plain object containing:
 * - `primary_emotion_weight`: finite number
 * - `secondary_emotion_weights`: Record<string, finite number>
 * - `intensity_weight`: finite number
 * - `valence_weight`: finite number
 */
export function isValidEmotionWeights(value: unknown): value is EmotionWeights {
  if (!isPlainObject(value)) return false;

  return (
    isFiniteNumber(value.primary_emotion_weight) &&
    isRecordOfFiniteNumbers(value.secondary_emotion_weights) &&
    isFiniteNumber(value.intensity_weight) &&
    isFiniteNumber(value.valence_weight)
  );
}

/**
 * Clamps an intensity value to the ESS-allowed range.
 *
 * Range: [{@link ESS_INTENSITY_MIN}, {@link ESS_INTENSITY_MAX}]
 */
export function clampIntensity(intensity: number): number {
  return clampToRange(intensity, ESS_INTENSITY_MIN, ESS_INTENSITY_MAX);
}

/**
 * Clamps a valence value to the ESS-allowed range.
 *
 * Range: [{@link ESS_VALENCE_MIN}, {@link ESS_VALENCE_MAX}]
 */
export function clampValence(valence: number): number {
  return clampToRange(valence, ESS_VALENCE_MIN, ESS_VALENCE_MAX);
}

/**
 * Returns a copy of {@link EmotionWeights} with every weight clamped into the
 * allowed range.
 *
 * Weight range: [{@link ESS_WEIGHT_MIN}, {@link ESS_WEIGHT_MAX}]
 *
 * This is a range guard only; it does not compute or infer any emotional
 * meaning.
 */
export function normalizeEmotionWeights(weights: EmotionWeights): EmotionWeights {
  const normalizedSecondary: Record<string, number> = {};

  for (const [key, value] of Object.entries(weights.secondary_emotion_weights)) {
    normalizedSecondary[key] = clampToRange(value, ESS_WEIGHT_MIN, ESS_WEIGHT_MAX);
  }

  return {
    primary_emotion_weight: clampToRange(weights.primary_emotion_weight, ESS_WEIGHT_MIN, ESS_WEIGHT_MAX),
    secondary_emotion_weights: normalizedSecondary,
    intensity_weight: clampToRange(weights.intensity_weight, ESS_WEIGHT_MIN, ESS_WEIGHT_MAX),
    valence_weight: clampValence(weights.valence_weight),
  };
}

/**
 * Type guard for {@link ESSIntent}.
 *
 * Validates that the value is a plain object containing:
 * - `semantic_core`: string
 * - `emotional_context`: {@link ESSEmotion}
 * - `clarity_score`: finite number
 */
export function isValidESSIntent(value: unknown): value is ESSIntent {
  if (!isPlainObject(value)) return false;

  return (
    typeof value.semantic_core === 'string' &&
    isValidESSEmotion(value.emotional_context) &&
    isFiniteNumber(value.clarity_score)
  );
}

/**
 * Compute deterministic emotion weights from an {@link EVAVector}.
 *
 * Structure-only placeholder:
 * - Validates the input vector using {@link validateEVAVectorShape}
 * - Returns fixed weights with a primary weight derived from `energy_mean`
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
 *
 * @param vector - Upstream EVA vector.
 * @returns Deterministic {@link EmotionWeights}.
 * @throws {ESSError} When vector validation fails.
 */
export async function compute_emotion_weights(vector: EVAVector): Promise<EmotionWeights> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO LOGIC IMPLEMENTATION
  // TODO(HGI): Compute emotion weighting from EVA vector per Canon
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
  const validation = validateEVAVectorShape(vector);
  if (!validation.ok) {
    throw createESSValidationError(
      ESSErrorCode.VALIDATION_ERROR,
      'Invalid EVAVector input for compute_emotion_weights.',
      { errors: validation.errors },
    );
  }

  const fallbackPrimary = clampIntensity(vector.energy_mean);

  let weights: EmotionWeights;

  try {
    const out = await essMLPModelLoader.inferFromEVAVector(vector, { executionProviders: ['cuda', 'cpu'] });

    weights = {
      primary_emotion_weight: Math.min(1, Math.max(0, out.primaryWeight)),
      secondary_emotion_weights: Object.fromEntries(
        Object.entries(out.secondaryWeights).map(([k, v]) => [k, Math.min(1, Math.max(0, v))]),
      ),
      intensity_weight: clampIntensity(Math.min(1, Math.max(0, out.intensityWeight))),
      valence_weight: clampValence(Math.min(1, Math.max(-1, out.valence))),
    };
  } catch {
    weights = {
      primary_emotion_weight: fallbackPrimary,
      secondary_emotion_weights: {
        joy: 0.2,
        sadness: 0.1,
      },
      intensity_weight: clampIntensity(fallbackPrimary),
      valence_weight: clampValence(0.5),
    };
  }

  const normalized = normalizeEmotionWeights(weights);

  if (!isValidEmotionWeights(normalized)) {
    throw createESSStubError({ weights: normalized });
  }

  return normalized;
}

/**
 * Synthesize an {@link ESSIntent} from an {@link EVAVector}.
 *
 * Structure-only wiring:
 * - Calls {@link compute_emotion_weights}
 * - Validates the returned {@link EmotionWeights}
 * - Assembles a deterministic {@link ESSEmotion} scaffold and validates it
 * - Returns an {@link ESSIntent} scaffold
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
 *
 * @param evaVector - Upstream EVA vector.
 * @returns A deterministic {@link ESSIntent} scaffold.
 * @throws {ESSError} When structural validation fails.
 */
export async function ess_synthesize(evaVector: EVAVector): Promise<ESSIntent> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO LOGIC IMPLEMENTATION
  // TODO(HGI): Implement emotion → intention synthesis
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
  const weights = await compute_emotion_weights(evaVector);

  if (!isValidEmotionWeights(weights)) {
    throw createESSStubError({ weights });
  }

  const emotional_context: ESSEmotion = {
    primary_emotion: 'joy',
    secondary_emotions: ['curiosity', 'calm'],
    intensity: clampIntensity(weights.primary_emotion_weight),
    valence: clampValence(0.5),
  };

  if (!isValidESSEmotion(emotional_context)) {
    throw createESSSynthesisError({ emotional_context });
  }

  if (emotional_context.primary_emotion.trim().length === 0) {
    throw createESSInvalidEmotionError(emotional_context.primary_emotion);
  }

  const intent: ESSIntent = {
    semantic_core: 'semantic_core_alpha',
    emotional_context,
    clarity_score: 1.0,
  };

  if (!isValidESSIntent(intent)) {
    throw createESSSynthesisError({ intent });
  }

  return intent;
}

/**
 * Pipeline adapter entry for ESS.
 *
 * Structure-only adapter:
 * - Validates an unknown pipeline payload as an {@link EVAVector}
 * - Normalizes by cloning the validated structure
 * - Calls {@link ess_synthesize}
 * - Validates the returned {@link ESSIntent}
 *
 * Reference:
 * - /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 * - /docs/core/hgi-core-v0.2-outline.md (Section II.2.2 ESS)
 *
 * @param input - Unknown upstream pipeline payload.
 * @returns A validated {@link ESSIntent}.
 * @throws {ESSError} When input or output validation fails.
 */
export async function ess_pipeline_entry(input: unknown): Promise<ESSIntent> {
  if (!isValidEVAVector(input)) {
    const shape = validateEVAVectorShape(input);
    const errors = shape.ok ? ['Invalid EVAVector payload.'] : shape.errors;
    throw createESSInvalidInputError('Invalid EVAVector input for ESS pipeline entry.', { errors });
  }

  const normalized: EVAVector = {
    pitch_mean: input.pitch_mean,
    pitch_variance: input.pitch_variance,
    energy_mean: input.energy_mean,
    rhythm_features: [...input.rhythm_features],
  };

  const intent = await ess_synthesize(normalized);

  if (!isValidESSIntent(intent)) {
    throw createESSSynthesisError({ intent });
  }

  return intent;
}
