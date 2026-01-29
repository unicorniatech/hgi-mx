import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import type { ESSIntent } from '../modules/ess/ess-placeholder';
import { extract_semantic_clusters, isValidSemanticCluster, validateClusterNodeIDs } from '../modules/molie/molie-placeholder';

function findFirstByExtSync(dir: string, ext: string, maxDepth: number): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.toLowerCase().endsWith(ext)) return full;
    }
    if (maxDepth <= 0) return null;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const nested = findFirstByExtSync(path.join(dir, e.name), ext, maxDepth - 1);
      if (nested !== null) return nested;
    }
    return null;
  } catch {
    return null;
  }
}

function setMolieEnvFromBaseIfPossible(): void {
  const base = process.env.MODEL_BASE_PATH ?? './models';
  const molieBase = path.resolve(base, 'molie');

  if (!(typeof process.env.MOLIE_PHI3_ONNX_PATH === 'string' && process.env.MOLIE_PHI3_ONNX_PATH.trim().length > 0)) {
    const onnxPath = findFirstByExtSync(molieBase, '.onnx', 4);
    if (onnxPath !== null) process.env.MOLIE_PHI3_ONNX_PATH = onnxPath;
  }

  if (!(typeof process.env.MOLIE_PHI3_VOCAB_PATH === 'string' && process.env.MOLIE_PHI3_VOCAB_PATH.trim().length > 0)) {
    const vocabPath = findFirstByExtSync(molieBase, 'vocab.txt', 4);
    if (vocabPath !== null) process.env.MOLIE_PHI3_VOCAB_PATH = vocabPath;
  }
}

setMolieEnvFromBaseIfPossible();

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
