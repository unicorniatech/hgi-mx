import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EVAInput } from '../../modules/eva/eva-placeholder';
import { eva_pipeline_entry, isValidEVAVector } from '../../modules/eva/eva-placeholder';
import { isValidAFInput } from '../../modules/af/af-placeholder';
import { hev_pipeline_entry, isValidHEVScore } from '../../modules/hev/hev-placeholder';
import { molie_pipeline_entry, isValidMOLIEMap } from '../../modules/molie/molie-placeholder';
import { bips_pipeline_entry, isValidIrreversibilityEnvelope } from '../../modules/bips/bips-placeholder';
import { mesh_pipeline_entry, isValidMeshNodeInfo } from '../../modules/mesh/mesh-placeholder';
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
  'integration: full EVA -> AF -> HEV -> MOLIE -> BIPS -> MESH flow',
  {
    skip:
      !hasEnv('EVA_WAV2VEC2_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_VOCAB_PATH') ||
      !hasEnv('MOLIE_PHI3_ONNX_PATH') ||
      !hasEnv('MOLIE_PHI3_VOCAB_PATH'),
  },
  async () => {
  const evaVector = await eva_pipeline_entry(makeEvaInput());
  assert.ok(isValidEVAVector(evaVector));

  const afInput = { eva_vector: evaVector, timestamp: Date.now() };
  assert.ok(isValidAFInput(afInput));

  const afOut = await AF.af_pipeline_entry(afInput);

  const hevScore = await hev_pipeline_entry(afOut.intent);
  assert.ok(isValidHEVScore(hevScore));

  const molieMap = await molie_pipeline_entry(afOut.intent);
  assert.ok(isValidMOLIEMap(molieMap));

  const envelope = await bips_pipeline_entry({ molieMap, hevScore });
  assert.ok(isValidIrreversibilityEnvelope(envelope));

  const node = await mesh_pipeline_entry(envelope);
  assert.ok(isValidMeshNodeInfo(node));
  },
);
