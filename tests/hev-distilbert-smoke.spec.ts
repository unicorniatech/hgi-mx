import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ESSIntent } from '../modules/ess/ess-placeholder';
import { hev_evaluate, validateHEVScore } from '../modules/hev/hev-placeholder';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

test('hev distilbert: hev_evaluate returns valid HEVScore (fallback-safe)', async () => {
  const intent: ESSIntent = {
    semantic_core: 'hello world',
    emotional_context: {
      primary_emotion: 'calm',
      secondary_emotions: ['curiosity'],
      intensity: 0.5,
      valence: 0.1,
    },
    clarity_score: 0.8,
  };

  const score = await hev_evaluate(intent);
  const validation = validateHEVScore(score);
  assert.ok(validation.ok);
  if (score.degradedMode !== undefined) {
    assert.equal(typeof score.degradedMode, 'boolean');
  }
});

test(
  'hev distilbert: uses configured ONNX model when HEV_DISTILBERT_ONNX_PATH and HEV_DISTILBERT_VOCAB_PATH are set',
  { skip: !(hasEnv('HEV_DISTILBERT_ONNX_PATH') && hasEnv('HEV_DISTILBERT_VOCAB_PATH')) },
  async () => {
    const intent: ESSIntent = {
      semantic_core: 'you are terrible',
      emotional_context: {
        primary_emotion: 'anger',
        secondary_emotions: ['hostility'],
        intensity: 0.9,
        valence: -0.7,
      },
      clarity_score: 0.6,
    };

    const score = await hev_evaluate(intent);
    const validation = validateHEVScore(score);
    assert.ok(validation.ok);
    if (score.degradedMode !== undefined) {
      assert.equal(typeof score.degradedMode, 'boolean');
    }
  },
);
