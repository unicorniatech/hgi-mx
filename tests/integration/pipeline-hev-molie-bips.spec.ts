import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isValidHGIIntent, hev_pipeline_entry, isValidHEVScore } from '../../modules/hev/hev-placeholder';
import { molie_pipeline_entry, isValidMOLIEMap } from '../../modules/molie/molie-placeholder';
import { bips_pipeline_entry, isValidIrreversibilityEnvelope, validateEnvelopeOrThrow } from '../../modules/bips/bips-placeholder';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function makeIntent(): unknown {
  return {
    semantic_core: 'intent_placeholder',
    emotional_context: {
      primary_emotion: 'joy',
      secondary_emotions: ['optimism'],
      intensity: 0.6,
      valence: 0.4,
    },
    clarity_score: 0.8,
  };
}

test(
  'integration: HEV -> MOLIE -> BIPS produces valid IrreversibilityEnvelope',
  {
    skip:
      !hasEnv('HEV_DISTILBERT_ONNX_PATH') ||
      !hasEnv('HEV_DISTILBERT_VOCAB_PATH') ||
      !hasEnv('MOLIE_PHI3_ONNX_PATH') ||
      !hasEnv('MOLIE_PHI3_VOCAB_PATH'),
  },
  async () => {
  const intent = makeIntent();
  assert.ok(isValidHGIIntent(intent));

  const hevScore = await hev_pipeline_entry(intent);
  assert.ok(isValidHEVScore(hevScore));

  const molieMap = await molie_pipeline_entry(intent);
  assert.ok(isValidMOLIEMap(molieMap));

  const env = await bips_pipeline_entry({ molieMap, hevScore });
  assert.ok(isValidIrreversibilityEnvelope(env));

  validateEnvelopeOrThrow(env);
  },
);
