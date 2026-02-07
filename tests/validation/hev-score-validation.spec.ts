import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HEVScore } from '../../modules/hev/hev-placeholder';
import { EthicalGradient, isValidHEVScore, validateHEVScore } from '../../modules/hev/hev-placeholder';

test('validation: validateHEVScore ok for in-range HEVScore', () => {
  const score: HEVScore = {
    clarity_score: 0.8,
    coherence_score: 0.7,
    vulnerability_score: 0.2,
    toxicity_score: 0.1,
    ethical_color: EthicalGradient.GREEN_SAFE,
  };

  assert.ok(isValidHEVScore(score));
  const res = validateHEVScore(score);
  assert.ok(res.ok, res.errors.join('; '));
});

test('validation: validateHEVScore fails for out-of-range metrics', () => {
  const score: HEVScore = {
    clarity_score: 2,
    coherence_score: -1,
    vulnerability_score: 0.2,
    toxicity_score: 0.1,
    ethical_color: EthicalGradient.GREEN_SAFE,
  };

  assert.ok(isValidHEVScore(score));
  const res = validateHEVScore(score);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});
