import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ESSEngine } from '../../modules/ess/ess-engine';
import { EthicalGradient } from '../../modules/hev/hev-placeholder';

test('validation: ESS bundles contain no raw intention or shard payload fields', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-ess-no-ids-'));
  const ess = new ESSEngine(path.join(dir, 'ess'));

  const intention = 'Contact me at alice@example.com or +1-555-123-4567';

  const shard = {
    emotion_vector: [0.1, 0.2, 0.3],
    intention_core: intention,
    ethical_score: {
      clarity_score: 0.8,
      coherence_score: 0.7,
      vulnerability_score: 0.2,
      toxicity_score: 0.1,
      ethical_color: EthicalGradient.GREEN_SAFE,
    },
    bips_envelope: {
      shard_id: 'test_shard_1',
      hash_contextual: '0123456789abcdef0123456789abcdef',
      entropy_proof: 0.4,
      similarity_score: 0.05,
    },
    timestamp: Date.now(),
  };

  const bundle = await ess.put(shard as any);

  const asString = JSON.stringify(bundle);
  assert.ok(!asString.includes(intention), 'bundle should not contain raw intention_core');
  assert.ok(!asString.includes('intention_core'), 'bundle should not include intention_core field');
  assert.ok(!asString.includes('emotion_vector'), 'bundle should not include emotion_vector field');
  assert.ok(!asString.includes('ethical_score'), 'bundle should not include ethical_score field');
  assert.ok(!asString.includes('bips_envelope'), 'bundle should not include bips_envelope field');

  assert.ok(Array.isArray(bundle.scene_tags));
  for (const tag of bundle.scene_tags) {
    assert.ok(!tag.startsWith('intent:'), 'scene_tags should not encode raw intent');
  }
});
