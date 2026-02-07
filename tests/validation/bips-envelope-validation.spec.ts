import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IrreversibilityEnvelope } from '../../modules/bips/bips-placeholder';
import {
  isValidHashContextual,
  isValidIrreversibilityEnvelope,
  isValidShardID,
  validateEnvelopeOrThrow,
} from '../../modules/bips/bips-placeholder';

test('validation: validateEnvelopeOrThrow accepts a well-formed IrreversibilityEnvelope', () => {
  const env: IrreversibilityEnvelope = {
    shard_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    hash_contextual: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    entropy_proof: 0.5,
    similarity_score: 0.1,
  };

  assert.ok(isValidShardID(env.shard_id));
  assert.ok(isValidHashContextual(env.hash_contextual));
  assert.ok(isValidIrreversibilityEnvelope(env));

  validateEnvelopeOrThrow(env);
});

test('validation: isValidIrreversibilityEnvelope rejects malformed envelopes', () => {
  assert.equal(isValidIrreversibilityEnvelope(null), false);
  assert.equal(isValidIrreversibilityEnvelope({}), false);
});
