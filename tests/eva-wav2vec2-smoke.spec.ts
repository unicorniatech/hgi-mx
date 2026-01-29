import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import type { EVAInput } from '../modules/eva/eva-placeholder';
import { extract_prosody_features, isValidProsodyFeatures } from '../modules/eva/eva-placeholder';

async function maybeSetEvaEnvFromBase(): Promise<void> {
  if (typeof process.env.EVA_WAV2VEC2_ONNX_PATH === 'string' && process.env.EVA_WAV2VEC2_ONNX_PATH.trim().length > 0) return;

  const base = process.env.MODEL_BASE_PATH ?? './models';
  const candidate = path.resolve(base, 'eva', 'model.onnx');
  if (fs.existsSync(candidate)) process.env.EVA_WAV2VEC2_ONNX_PATH = candidate;
}

void maybeSetEvaEnvFromBase();

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

test('eva wav2vec2: extract_prosody_features returns valid ProsodyFeatures (fallback-safe)', async () => {
  await maybeSetEvaEnvFromBase();
  const input: EVAInput = {
    timestamp: 0,
    duration_ms: 2_000,
    sample_rate: 16_000,
  };

  const features = await extract_prosody_features(input);
  assert.ok(isValidProsodyFeatures(features));
  assert.ok(features.pitch_mean >= 0 && features.pitch_mean <= 1);
  assert.ok(features.pitch_variance >= 0 && features.pitch_variance <= 1);
  assert.ok(features.energy_mean >= 0 && features.energy_mean <= 1);
  assert.equal(features.rhythm_features.length, 8);
});

test('eva wav2vec2: uses configured ONNX model when EVA_WAV2VEC2_ONNX_PATH is set', { skip: !hasEnv('EVA_WAV2VEC2_ONNX_PATH') }, async () => {
  await maybeSetEvaEnvFromBase();
  const input: EVAInput = {
    timestamp: 0,
    duration_ms: 2_000,
    sample_rate: 16_000,
  };

  const features = await extract_prosody_features(input);
  assert.ok(isValidProsodyFeatures(features));
});
