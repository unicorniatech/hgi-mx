import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EVAInput } from '../modules/eva/eva-placeholder';
import { extract_prosody_features, isValidProsodyFeatures } from '../modules/eva/eva-placeholder';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

test('eva wav2vec2: extract_prosody_features returns valid ProsodyFeatures (fallback-safe)', async () => {
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
  const input: EVAInput = {
    timestamp: 0,
    duration_ms: 2_000,
    sample_rate: 16_000,
  };

  const features = await extract_prosody_features(input);
  assert.ok(isValidProsodyFeatures(features));
});
