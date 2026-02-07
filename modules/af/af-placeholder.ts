import type { EVAVector } from '../eva/eva-placeholder';

import { clampIntensity, clampValence, prosodyToEmotionMapping } from './af-emotion-mapper';

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

export interface AFInput {
  eva_vector: EVAVector;
  timestamp: number;
}

export interface AFOutput {
  intent: HGIIntent;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export enum AFErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  PIPELINE_MISMATCH = 'PIPELINE_MISMATCH',
  INVALID_OUTPUT = 'INVALID_OUTPUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export class AFError extends Error {
  public readonly code: AFErrorCode;
  public readonly timestamp: number;
  public readonly details?: unknown;

  public constructor(code: AFErrorCode, message: string, options?: { timestamp?: number; details?: unknown; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'AFError';
    this.code = code;
    this.timestamp = options?.timestamp ?? Date.now();
    this.details = options?.details;
    Object.setPrototypeOf(this, AFError.prototype);
  }
}

function createAFValidationError(code: AFErrorCode, message: string, details?: unknown, cause?: unknown): AFError {
  return new AFError(code, message, { details, cause });
}

export function isValidAFInput(value: unknown): value is AFInput {
  if (!isPlainObject(value)) return false;
  if (!isFiniteNumber(value.timestamp)) return false;

  const eva = value.eva_vector;
  if (!isPlainObject(eva)) return false;

  const rhythm = (eva as Record<string, unknown>).rhythm_features;
  if (!Array.isArray(rhythm)) return false;
  if (!rhythm.every((x) => typeof x === 'number' && Number.isFinite(x))) return false;

  return (
    isFiniteNumber((eva as Record<string, unknown>).pitch_mean) &&
    isFiniteNumber((eva as Record<string, unknown>).pitch_variance) &&
    isFiniteNumber((eva as Record<string, unknown>).energy_mean)
  );
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

export async function af_transform(input: AFInput): Promise<AFOutput> {
  if (!isValidAFInput(input)) {
    throw createAFValidationError(AFErrorCode.INVALID_INPUT, 'Invalid AFInput for af_transform.');
  }

  const mapping = prosodyToEmotionMapping({
    pitch_mean: input.eva_vector.pitch_mean,
    pitch_variance: input.eva_vector.pitch_variance,
    energy_mean: input.eva_vector.energy_mean,
  });

  const rhythmLen = input.eva_vector.rhythm_features.length;
  const clarity_score = Math.min(1, Math.max(0, 1 - rhythmLen / 4096));

  const intent: HGIIntent = {
    semantic_core: 'intent_placeholder',
    emotional_context: {
      primary_emotion: mapping.primary_emotion,
      secondary_emotions: mapping.secondary_emotions,
      intensity: clampIntensity(mapping.intensity),
      valence: clampValence(mapping.valence),
    },
    clarity_score,
  };

  if (!isValidHGIIntent(intent)) {
    throw createAFValidationError(AFErrorCode.INVALID_OUTPUT, 'af_transform produced an invalid HGIIntent.', { intent });
  }

  return { intent };
}

export async function af_pipeline_entry(input: unknown): Promise<AFOutput> {
  if (!isValidAFInput(input)) {
    throw createAFValidationError(AFErrorCode.PIPELINE_MISMATCH, 'Invalid AFInput for AF pipeline entry.', { input });
  }

  const normalized: AFInput = {
    eva_vector: {
      pitch_mean: input.eva_vector.pitch_mean,
      pitch_variance: input.eva_vector.pitch_variance,
      energy_mean: input.eva_vector.energy_mean,
      rhythm_features: [...input.eva_vector.rhythm_features],
    },
    timestamp: input.timestamp,
  };

  const out = await af_transform(normalized);

  if (!isValidHGIIntent(out.intent)) {
    throw createAFValidationError(AFErrorCode.INVALID_OUTPUT, 'AF pipeline entry produced an invalid HGIIntent.', { intent: out.intent });
  }

  return out;
}
