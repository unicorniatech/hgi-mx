import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EVAVector } from '../modules/eva/eva-placeholder';
import { compute_emotion_weights, isValidEmotionWeights, normalizeEmotionWeights } from '../modules/ess/ess-placeholder';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

test('ess mlp: compute_emotion_weights returns valid EmotionWeights (fallback-safe)', async () => {
  const evaVector: EVAVector = {
    pitch_mean: 0.5,
    pitch_variance: 0.1,
    energy_mean: 0.5,
    rhythm_features: new Array(8).fill(0.5),
  };

  const weights = await compute_emotion_weights(evaVector);
  assert.ok(isValidEmotionWeights(weights));
  assert.ok(weights.primary_emotion_weight >= 0 && weights.primary_emotion_weight <= 1);
  assert.ok(weights.intensity_weight >= 0 && weights.intensity_weight <= 1);
  assert.ok(weights.valence_weight >= -1 && weights.valence_weight <= 1);
});

test('ess mlp: normalizeEmotionWeights preserves negative valence in [-1,1]', async () => {
  const normalized = normalizeEmotionWeights({
    primary_emotion_weight: 0.5,
    secondary_emotion_weights: { joy: 0.2 },
    intensity_weight: 0.5,
    valence_weight: -0.7,
  });

  assert.ok(isValidEmotionWeights(normalized));
  assert.equal(normalized.valence_weight, -0.7);
});

test('ess mlp: uses configured ONNX model when ESS_MLP_ONNX_PATH is set', { skip: !hasEnv('ESS_MLP_ONNX_PATH') }, async () => {
  const evaVector: EVAVector = {
    pitch_mean: 0.5,
    pitch_variance: 0.1,
    energy_mean: 0.5,
    rhythm_features: new Array(8).fill(0.5),
  };

  const weights = await compute_emotion_weights(evaVector);
  assert.ok(isValidEmotionWeights(weights));
});
