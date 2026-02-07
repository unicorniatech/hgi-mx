import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HEVScore } from '../../modules/hev/hev-placeholder';
import { EthicalGradient } from '../../modules/hev/hev-placeholder';
import type { MOLIEMap } from '../../modules/molie/molie-placeholder';
import { bips_generate } from '../../modules/bips/bips-placeholder';
import { mesh_pipeline_entry, isValidMeshNodeInfo } from '../../modules/mesh/mesh-placeholder';

function makeMap(): MOLIEMap {
  return {
    intention_nodes: [
      { id: 'node_alpha', semantic_weight: 0.6, emotional_anchor: 'anchor_alpha', connections: ['node_beta'] },
      { id: 'node_beta', semantic_weight: 0.4, emotional_anchor: 'anchor_beta', connections: ['node_alpha'] },
    ],
    semantic_clusters: [
      { id: 'cluster_alpha', node_ids: ['node_alpha'], cluster_weight: 0.5 },
      { id: 'cluster_beta', node_ids: ['node_beta'], cluster_weight: 0.3 },
      { id: 'cluster_gamma', node_ids: ['node_alpha', 'node_beta'], cluster_weight: 0.2 },
    ],
    narrative_threads: ['thread_alpha'],
  };
}

function makeScore(): HEVScore {
  return {
    clarity_score: 0.8,
    coherence_score: 0.75,
    vulnerability_score: 0.3,
    toxicity_score: 0.1,
    ethical_color: EthicalGradient.GREEN_SAFE,
  };
}

test('integration: BIPS -> MESH produces valid MeshNodeInfo', async () => {
  const envelope = await bips_generate(makeMap(), makeScore());
  const node = await mesh_pipeline_entry(envelope);
  assert.ok(isValidMeshNodeInfo(node));
});
