import { meshLibp2pAdapter } from '../../modules/mesh/mesh-libp2p-adapter.js';
import {
  isValidGossipMessage,
  isValidMeshNodeInfo,
  MeshNodeInfo,
  NodeType,
} from '../../modules/mesh/mesh-placeholder.js';
import type { EmoShard } from '../../modules/bips/bips-placeholder.js';
import { isValidEmoShard } from '../../modules/bips/bips-placeholder.js';
import type { HEVScore } from '../../modules/hev/hev-placeholder.js';
import { EthicalGradient } from '../../modules/hev/hev-placeholder.js';

function print(obj: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(obj, null, 2));
}

function makeLocalNode(nodeId: string): MeshNodeInfo {
  return {
    node_id: nodeId,
    node_type: NodeType.personal,
    reputation_score: 0.5,
    ethical_weight: 0.8,
  };
}

function makeEthicalScore(): HEVScore {
  return {
    clarity_score: 0.8,
    coherence_score: 0.7,
    vulnerability_score: 0.2,
    toxicity_score: 0.1,
    ethical_color: EthicalGradient.GREEN_SAFE,
  };
}

function makeShard(score: HEVScore): EmoShard {
  return {
    emotion_vector: [0.25, 0.5, 0.75],
    intention_core: 'intention_alpha',
    ethical_score: score,
    bips_envelope: null,
    timestamp: Date.now(),
  };
}

async function main(argv: string[]): Promise<void> {
  process.env.MESH_LIBP2P_SMOKE = '1';

  const nodeId = argv[0]?.trim() || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const node = makeLocalNode(nodeId);
  if (!isValidMeshNodeInfo(node)) {
    throw new Error('mesh-local-sim: invalid MeshNodeInfo scaffold');
  }

  try {
    await meshLibp2pAdapter.registerLocalNode(node.node_id);

    const peers = meshLibp2pAdapter.getDiscoveredPeerIds();

    const ethical_score = makeEthicalScore();
    const shard = makeShard(ethical_score);
    if (!isValidEmoShard(shard)) {
      throw new Error('mesh-local-sim: generated EmoShard failed validation');
    }

    const gossip = {
      message_id: 'gossip_alpha',
      sender_node_id: node.node_id,
      shard_payload: shard,
      timestamp: Date.now(),
    };

    if (!isValidGossipMessage(gossip)) {
      throw new Error('mesh-local-sim: generated GossipMessage failed validation');
    }

    // Print requested outputs.
    // eslint-disable-next-line no-console
    console.log(`node_id=${node.node_id}`);
    // eslint-disable-next-line no-console
    console.log(`peers=${peers.length}`);
    if (peers.length > 0) print({ peer_ids: peers });
    print({ gossip });
  } finally {
    await meshLibp2pAdapter.stop();
  }
}

main(process.argv.slice(2)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
