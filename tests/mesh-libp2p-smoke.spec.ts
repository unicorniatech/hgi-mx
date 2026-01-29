import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mesh_register_node, isValidMeshNodeInfo, NodeType } from '../modules/mesh/mesh-placeholder';
import { meshLibp2pAdapter } from '../modules/mesh/mesh-libp2p-adapter';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

test(
  'mesh libp2p: register node starts libp2p and returns valid MeshNodeInfo (opt-in)',
  { skip: !hasEnv('MESH_LIBP2P_SMOKE') },
  async () => {
    try {
      const node = await mesh_register_node({
        node_id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        node_type: NodeType.personal,
        reputation_score: 0.5,
        ethical_weight: 0.8,
      });

      assert.ok(isValidMeshNodeInfo(node));
      assert.ok(node.reputation_score >= 0 && node.reputation_score <= 1);
      assert.ok(node.ethical_weight >= 0 && node.ethical_weight <= 1);
    } finally {
      await meshLibp2pAdapter.stop();
    }
  },
);
