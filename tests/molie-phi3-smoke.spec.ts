import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ESSIntent } from '../modules/ess/ess-placeholder';
import { extract_semantic_clusters, isValidSemanticCluster, validateClusterNodeIDs } from '../modules/molie/molie-placeholder';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

test('molie phi3: extract_semantic_clusters returns valid clusters (fallback-safe)', async () => {
  const intent: ESSIntent = {
    semantic_core: 'book a flight to mexico city next week',
    emotional_context: {
      primary_emotion: 'anticipation',
      secondary_emotions: ['curiosity'],
      intensity: 0.6,
      valence: 0.4,
    },
    clarity_score: 0.8,
  };

  const clusters = await extract_semantic_clusters(intent);
  assert.ok(Array.isArray(clusters));
  assert.ok(clusters.length > 0);

  for (const c of clusters) {
    assert.ok(isValidSemanticCluster(c));
    assert.ok(c.cluster_weight >= 0 && c.cluster_weight <= 1);
    assert.ok(validateClusterNodeIDs(c.node_ids).ok);
  }
});

test(
  'molie phi3: uses configured ONNX model when MOLIE_PHI3_ONNX_PATH and MOLIE_PHI3_VOCAB_PATH are set',
  { skip: !(hasEnv('MOLIE_PHI3_ONNX_PATH') && hasEnv('MOLIE_PHI3_VOCAB_PATH')) },
  async () => {
    const intent: ESSIntent = {
      semantic_core: 'summarize the key risks and provide mitigation steps',
      emotional_context: {
        primary_emotion: 'calm',
        secondary_emotions: ['focus'],
        intensity: 0.4,
        valence: 0.1,
      },
      clarity_score: 0.7,
    };

    const clusters = await extract_semantic_clusters(intent);
    assert.ok(Array.isArray(clusters));
    assert.ok(clusters.length > 0);

    for (const c of clusters) {
      assert.ok(isValidSemanticCluster(c));
      assert.ok(c.cluster_weight >= 0 && c.cluster_weight <= 1);
    }
  },
);
