import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EVAVector } from '../../modules/eva/eva-placeholder';
import { isValidEVAVector } from '../../modules/eva/eva-placeholder';

test('validation: isValidEVAVector accepts a well-formed EVAVector', () => {
  const v: EVAVector = {
    pitch_mean: 0.5,
    pitch_variance: 0.1,
    energy_mean: 0.7,
    rhythm_features: [0.1, 0.2, 0.3],
  };

  assert.ok(isValidEVAVector(v));
});

test('validation: isValidEVAVector rejects non-object and malformed structures', () => {
  assert.equal(isValidEVAVector(null), false);
  assert.equal(isValidEVAVector(undefined), false);
  assert.equal(isValidEVAVector(123), false);

  assert.equal(
    isValidEVAVector({ pitch_mean: 0.5, pitch_variance: 0.1, energy_mean: 0.7, rhythm_features: ['x'] } as unknown),
    false,
  );
});
