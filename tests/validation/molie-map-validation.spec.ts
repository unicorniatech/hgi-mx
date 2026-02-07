import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MOLIEMap } from '../../modules/molie/molie-placeholder';
import { isValidMOLIEMap } from '../../modules/molie/molie-placeholder';

test('validation: isValidMOLIEMap accepts a well-formed MOLIEMap', () => {
  const map: MOLIEMap = {
    intention_nodes: [
      { id: 'node_alpha', semantic_weight: 0.6, emotional_anchor: 'anchor_alpha', connections: ['node_beta'] },
      { id: 'node_beta', semantic_weight: 0.4, emotional_anchor: 'anchor_beta', connections: ['node_alpha'] },
    ],
    semantic_clusters: [
      { id: 'cluster_alpha', node_ids: ['node_alpha'], cluster_weight: 0.5 },
      { id: 'cluster_beta', node_ids: ['node_beta'], cluster_weight: 0.3 },
    ],
    narrative_threads: ['thread_alpha'],
  };

  assert.ok(isValidMOLIEMap(map));
});

test('validation: isValidMOLIEMap rejects invalid cluster node references', () => {
  const map: MOLIEMap = {
    intention_nodes: [{ id: 'node_alpha', semantic_weight: 0.6, emotional_anchor: 'anchor_alpha', connections: [] }],
    semantic_clusters: [{ id: 'cluster_alpha', node_ids: ['bad node id'], cluster_weight: 0.5 }],
    narrative_threads: [],
  };

  assert.equal(isValidMOLIEMap(map), false);
});
