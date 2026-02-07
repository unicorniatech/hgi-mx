import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EVAInput } from '../../modules/eva/eva-placeholder';
import { eva_pipeline_entry, isValidEVAVector } from '../../modules/eva/eva-placeholder';
import { isValidAFInput } from '../../modules/af/af-placeholder';
import { isValidHGIIntent } from '../../modules/hev/hev-placeholder';
import { hev_pipeline_entry, isValidHEVScore, validateHEVScore } from '../../modules/hev/hev-placeholder';
import { AF } from '../../modules/index';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function makeEvaInput(): EVAInput {
  return {
    timestamp: Date.now(),
    duration_ms: 2_000,
    sample_rate: 16_000,
  };
}

test(
  'integration: EVA -> AF -> HEV produces valid HEVScore',
  {
    skip:
      !hasEnv('EVA_WAV2VEC2_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_VOCAB_PATH'),
  },
  async () => {
  const evaVector = await eva_pipeline_entry(makeEvaInput());
  assert.ok(isValidEVAVector(evaVector));

  const afInput = { eva_vector: evaVector, timestamp: Date.now() };
  assert.ok(isValidAFInput(afInput));

  const afOut = await AF.af_pipeline_entry(afInput);
  assert.ok(isValidHGIIntent(afOut.intent));

  const hevScore = await hev_pipeline_entry(afOut.intent);
  assert.ok(isValidHEVScore(hevScore));

  const v = validateHEVScore(hevScore);
  assert.ok(v.ok, v.errors.join('; '));
  },
);
