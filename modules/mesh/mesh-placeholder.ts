// TODO: This module will implement Umbilical Mesh + MeshNet integration surfaces.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md` (Section 6/8)
//   and `/docs/protocols/meshnet-outline.md`.
// - Keep changes atomic and versionable.

import type { EmoShard, IrreversibilityEnvelope } from '../bips/bips-placeholder';
import {
  isValidEmoShard,
  isValidHashContextual,
  isValidIrreversibilityEnvelope,
  isValidShardID,
  validateSimilarityThreshold,
} from '../bips/bips-placeholder';
import { EthicalGradient } from '../hev/hev-placeholder';
import type { HEVScore } from '../hev/hev-placeholder';
import { meshLibp2pAdapter } from './mesh-libp2p-adapter';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Narrow an `unknown` value to a plain object record.
 *
 * This helper is intentionally conservative:
 * - Returns `true` only for non-null objects.
 * - Excludes arrays.
 *
 * @param value - The value to check.
 * @returns `true` when `value` is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check whether a value is a finite `number`.
 *
 * @param value - The value to check.
 * @returns `true` when `value` is a `number` and `Number.isFinite(value)`.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export const MESH_SCORE_MIN = 0.0;

export const MESH_SCORE_MAX = 1.0;

function clampMeshScore(value: number): number {
  if (value < MESH_SCORE_MIN) return MESH_SCORE_MIN;
  if (value > MESH_SCORE_MAX) return MESH_SCORE_MAX;
  return value;
}

/**
 * Clamp a mesh node's reputation score into the supported range.
 *
 * Range: `[MESH_SCORE_MIN, MESH_SCORE_MAX]` (defaults to `[0.0, 1.0]`).
 *
 * @param s - The raw reputation score.
 * @returns The clamped reputation score.
 */
export function clampReputationScore(s: number): number {
  return clampMeshScore(s);
}

/**
 * Clamp a mesh node's ethical weight into the supported range.
 *
 * Range: `[MESH_SCORE_MIN, MESH_SCORE_MAX]` (defaults to `[0.0, 1.0]`).
 *
 * @param w - The raw ethical weight.
 * @returns The clamped ethical weight.
 */
export function clampEthicalWeight(w: number): number {
  return clampMeshScore(w);
}

/**
 * Stable error codes for Mesh structural/validation failures.
 */
export enum MeshErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_NODE = 'INVALID_NODE',
  NODE_STUB_FAIL = 'NODE_STUB_FAIL',
  GOSSIP_MISMATCH = 'GOSSIP_MISMATCH',
  PIPELINE_INCOMPATIBLE = 'PIPELINE_INCOMPATIBLE',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',
}

/**
 * Mesh-scoped error type for structural/validation failures.
 *
 * This is infrastructure only. It does not implement any networking, routing,
 * P2P handshakes, or other mesh semantics.
 */
export class MeshError extends Error {
  public readonly code: MeshErrorCode;

  public readonly timestamp: Date;

  /**
   * Create a new {@link MeshError}.
   *
   * @param code - Stable mesh error code.
   * @param message - Human-readable message.
   * @param timestamp - Optional timestamp override.
   */
  public constructor(code: MeshErrorCode, message: string, timestamp: Date = new Date()) {
    super(message);
    this.name = 'MeshError';
    this.code = code;
    this.timestamp = timestamp;

    // Ensure prototype chain is correct when targeting older JS runtimes.
    Object.setPrototypeOf(this, MeshError.prototype);
  }
}

/**
 * Factory for a generic Mesh validation error.
 *
 * @param message - Human-readable message.
 * @returns A {@link MeshError} with code {@link MeshErrorCode.VALIDATION_ERROR}.
 */
export function createMeshValidationError(message: string): MeshError {
  return new MeshError(MeshErrorCode.VALIDATION_ERROR, message);
}

/**
 * Factory for an invalid mesh node error.
 *
 * @param reason - Human-readable reason.
 * @param node - Optional node value for context.
 * @returns A {@link MeshError} with code {@link MeshErrorCode.INVALID_NODE}.
 */
export function createMeshInvalidNodeError(reason: string, node?: unknown): MeshError {
  void node;
  return new MeshError(MeshErrorCode.INVALID_NODE, reason);
}

/**
 * Factory for a deterministic mesh node stub failure.
 *
 * Use this when a structure-only placeholder is expected to return deterministic
 * node data but fails internal structural invariants.
 *
 * Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
 *
 * @param details - Optional additional context.
 * @returns A {@link MeshError} with code {@link MeshErrorCode.NODE_STUB_FAIL}.
 */
export function createMeshNodeStubError(details?: unknown): MeshError {
  void details;
  return new MeshError(MeshErrorCode.NODE_STUB_FAIL, 'Mesh node stub failed structural invariants.');
}

/**
 * Factory for a gossip payload mismatch error.
 *
 * Use this when a structure-only gossip wiring path produces an invalid
 * {@link GossipMessage} payload.
 *
 * Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
 *
 * @param details - Optional additional context.
 * @returns A {@link MeshError} with code {@link MeshErrorCode.GOSSIP_MISMATCH}.
 */
export function createMeshGossipError(details?: unknown): MeshError {
  void details;
  return new MeshError(MeshErrorCode.GOSSIP_MISMATCH, 'Mesh gossip payload failed structural invariants.');
}

/**
 * Validate that a value is one of the values in the provided enum object.
 *
 * This helper supports string/number enums.
 *
 * @param enumObject - The enum to validate against.
 * @param value - The candidate value.
 * @returns `true` when `value` is a member of `enumObject`.
 */
export function isEnumValue<TEnum extends Record<string, string | number>>(
  enumObject: TEnum,
  value: unknown,
): value is TEnum[keyof TEnum] {
  return (Object.values(enumObject) as Array<string | number>).includes(value as string | number);
}

/**
 * Runtime validator / type guard for {@link MeshNodeInfo}.
 *
 * This guard validates only the structural shape of the node info (types of fields).
 * It does not implement networking, P2P logic, or reputation semantics.
 *
 * @param node - The value to validate.
 * @returns `true` when `node` matches the {@link MeshNodeInfo} structure.
 */
export function isValidMeshNodeInfo(node: unknown): node is MeshNodeInfo {
  if (!isRecord(node)) return false;

  return (
    typeof node.node_id === 'string' &&
    typeof node.node_type === 'string' &&
    isValidNodeType(node.node_type) &&
    isFiniteNumber(node.reputation_score) &&
    isFiniteNumber(node.ethical_weight)
  );
}

/**
 * Normalize a {@link MeshNodeInfo} into a canonical structural form.
 *
 * This performs structural normalization only:
 * - Clamps `reputation_score` into the supported range.
 * - Clamps `ethical_weight` into the supported range.
 * - Returns a new object (does not mutate the input).
 *
 * @param node - The mesh node info to normalize.
 * @returns A normalized copy of `node`.
 */
export function normalizeMeshNodeInfo(node: MeshNodeInfo): MeshNodeInfo {
  return {
    ...node,
    reputation_score: clampReputationScore(node.reputation_score),
    ethical_weight: clampEthicalWeight(node.ethical_weight),
  };
}

/**
 * Runtime validator / type guard for {@link GossipMessage}.
 *
 * This guard validates only the structural shape of the message (types of fields).
 * It does not implement gossiping, routing, or any network semantics.
 *
 * @param msg - The value to validate.
 * @returns `true` when `msg` matches the {@link GossipMessage} structure.
 */
export function isValidGossipMessage(msg: unknown): msg is GossipMessage {
  if (!isRecord(msg)) return false;

  return (
    typeof msg.message_id === 'string' &&
    typeof msg.sender_node_id === 'string' &&
    isValidEmoShard(msg.shard_payload) &&
    isFiniteNumber(msg.timestamp)
  );
}

export enum NodeType {
  personal = "personal",
  community = "community",
  elder = "elder",
  eva = "eva",
  ghost = "ghost",
  purifier = "purifier",
  founder = "founder",
}

const NODE_TYPE_TO_STRING: Record<NodeType, string> = {
  [NodeType.personal]: 'personal',
  [NodeType.community]: 'community',
  [NodeType.elder]: 'elder',
  [NodeType.eva]: 'eva',
  [NodeType.ghost]: 'ghost',
  [NodeType.purifier]: 'purifier',
  [NodeType.founder]: 'founder',
};

export const NODE_TYPE_WEIGHT: Readonly<Record<NodeType, number>> = Object.freeze({
  [NodeType.founder]: 1.0,
  [NodeType.elder]: 0.8,
  [NodeType.purifier]: 0.6,
  [NodeType.eva]: 0.4,
  [NodeType.community]: 0.3,
  [NodeType.personal]: 0.2,
  [NodeType.ghost]: 0.01,
});

export function getNodeTypeWeight(nodeType: NodeType): number {
  const w = NODE_TYPE_WEIGHT[nodeType];
  return clampEthicalWeight(w);
}

export function isValidNodeTypeWeightMap(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  for (const [k, v] of Object.entries(value)) {
    if (!isValidNodeType(k)) return false;
    if (!isFiniteNumber(v)) return false;
    if (v < MESH_SCORE_MIN || v > MESH_SCORE_MAX) return false;
  }
  return true;
}

const STRING_TO_NODE_TYPE: Readonly<Record<string, NodeType>> = Object.freeze(
  Object.fromEntries(Object.entries(NODE_TYPE_TO_STRING).map(([key, value]) => [value, key as NodeType])) as Record<
    string,
    NodeType
  >,
);

/**
 * Serialize a {@link NodeType} to its canonical string representation.
 *
 * @param nodeType - The {@link NodeType} to serialize.
 * @returns The canonical string representation.
 */
export function nodeTypeToString(nodeType: NodeType): string {
  return NODE_TYPE_TO_STRING[nodeType];
}

/**
 * Parse a string into a {@link NodeType}.
 *
 * @param value - The candidate string.
 * @returns The parsed {@link NodeType}.
 * @throws {Error} If the input is not a recognized node type.
 */
export function stringToNodeType(value: string): NodeType {
  const nodeType = STRING_TO_NODE_TYPE[value];
  if (nodeType === undefined) {
    throw new Error(`Invalid NodeType: ${value}`);
  }
  return nodeType;
}

/**
 * Type guard for {@link NodeType}.
 *
 * @param t - Candidate string.
 * @returns `true` when `t` is a recognized {@link NodeType}.
 */
export function isValidNodeType(t: string): t is NodeType {
  return STRING_TO_NODE_TYPE[t] !== undefined;
}

export interface MeshEnvConfig {
  node_type: NodeType;
  listen_port: number;
  bootstrap_nodes: string[];
}

function parseListenPortEnv(raw: string | undefined): number {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.length === 0) return 9001;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) {
    throw createMeshValidationError(`Invalid HGI_LISTEN_PORT: ${s}`);
  }
  return Math.floor(n);
}

function parseBootstrapNodesEnv(raw: string | undefined): string[] {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.length === 0) return [];

  const nodes = s
    .split(/[\s,]+/g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  for (const ma of nodes) {
    if (!ma.startsWith('/')) {
      throw createMeshValidationError(`Invalid HGI_BOOTSTRAP_NODES entry (expected multiaddr): ${ma}`);
    }
    if (!ma.includes('/p2p/')) {
      throw createMeshValidationError(`Invalid HGI_BOOTSTRAP_NODES entry (missing /p2p/ peer id): ${ma}`);
    }
  }

  return nodes;
}

export function loadMeshEnvConfig(): MeshEnvConfig {
  const rawType = typeof process.env.HGI_NODE_TYPE === 'string' ? process.env.HGI_NODE_TYPE.trim() : '';
  const nodeTypeString = rawType.length > 0 ? rawType : 'elder';

  if (!isValidNodeType(nodeTypeString)) {
    throw createMeshValidationError(
      `Invalid HGI_NODE_TYPE: ${nodeTypeString}. Allowed: elder|eva|ghost|purifier|founder`,
    );
  }

  const node_type = stringToNodeType(nodeTypeString);

  const weight = NODE_TYPE_WEIGHT[node_type];
  if (!isFiniteNumber(weight)) {
    throw createMeshValidationError(`Invalid NODE_TYPE_WEIGHT for node type: ${nodeTypeString}`);
  }

  const listen_port = parseListenPortEnv(process.env.HGI_LISTEN_PORT);
  const bootstrap_nodes = parseBootstrapNodesEnv(process.env.HGI_BOOTSTRAP_NODES);

  return {
    node_type,
    listen_port,
    bootstrap_nodes,
  };
}

export interface MeshNodeInfo {
  node_id: string;
  node_type: NodeType;
  reputation_score: number;
  ethical_weight: number;
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO P2P LOGIC
  // TODO(HGI): NO NETWORK OPERATIONS
  // Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
}

export interface GossipMessage {
  message_id: string;
  sender_node_id: string;
  shard_payload: EmoShard;
  timestamp: number;
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO P2P LOGIC
  // TODO(HGI): NO NETWORK OPERATIONS
  // Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
}

export async function mesh_handshake(peer: MeshNodeInfo): Promise<boolean> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO P2P LOGIC
  // TODO(HGI): NO NETWORK OPERATIONS
  // TODO(HGI): Implement P2P handshake protocol
  // Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
  void peer;
  throw new Error("Not implemented");
}

export async function gossip_broadcast(message: GossipMessage): Promise<void> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO P2P LOGIC
  // TODO(HGI): NO NETWORK OPERATIONS
  // TODO(HGI): Implement gossip protocol
  // Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
  void message;
  throw new Error("Not implemented");
}

export async function discover_peers(): Promise<MeshNodeInfo[]> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO P2P LOGIC
  // TODO(HGI): NO NETWORK OPERATIONS
  // TODO(HGI): Discover mesh peers
  // Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
  throw new Error("Not implemented");
}

export async function publishEmoShard(topic: string, shard: EmoShard): Promise<boolean> {
  return meshLibp2pAdapter.publishEmoShard(topic, shard);
}

/**
 * Register a mesh node in the local node registry (structure-only stub).
 *
 * This function performs structural validation and deterministic registration only:
 * - Validates the input node using {@link isValidMeshNodeInfo}
 * - Returns a deterministic registration payload with clamped scores
 *
 * No networking, P2P handshake, routing, or persistence is implemented.
 *
 * Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
 *
 * @param node - Candidate node info to register.
 * @returns A deterministic registered {@link MeshNodeInfo}.
 * @throws {MeshError} When validation fails.
 */
export async function mesh_register_node(node: MeshNodeInfo): Promise<MeshNodeInfo> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO P2P LOGIC
  // TODO(HGI): NO NETWORK OPERATIONS
  // TODO(HGI): Register mesh node (local registry)
  // Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
  if (!isValidMeshNodeInfo(node)) {
    throw createMeshInvalidNodeError('Invalid MeshNodeInfo input for mesh_register_node.', node);
  }

  if (typeof node.node_id !== 'string' || node.node_id.trim().length === 0) {
    throw createMeshValidationError('mesh_register_node requires a non-empty node_id.');
  }

  let registered: MeshNodeInfo = {
    ...node,
    node_id: node.node_id,
    reputation_score: clampReputationScore(node.reputation_score),
    ethical_weight: clampEthicalWeight(node.ethical_weight),
  };

  if (hasEnv('MESH_LIBP2P_SMOKE')) {
    try {
      await meshLibp2pAdapter.registerLocalNode(node.node_id);

      const peers = meshLibp2pAdapter.getDiscoveredPeerIds().slice(0, 5);
      let okCount = 0;
      for (const peerId of peers) {
        const ok = await meshLibp2pAdapter.handshakeWithPeer(peerId);
        if (ok) okCount += 1;
      }

      registered = normalizeMeshNodeInfo({
        ...registered,
        reputation_score: clampReputationScore(registered.reputation_score + okCount * 0.05),
      });
    } catch (err) {
      console.warn('Mesh libp2p registration failed - fallback active:', err);
      registered = normalizeMeshNodeInfo({
        ...registered,
        reputation_score: clampReputationScore(0.5),
        ethical_weight: clampEthicalWeight(0.8),
      });
    }
  }

  if (!isValidMeshNodeInfo(registered)) {
    throw createMeshNodeStubError({ registered });
  }

  return registered;
}

/**
 * Propagate a deterministic gossip message (structure-only wiring).
 *
 * This function performs structural wiring only:
 * - Registers the sender node via {@link mesh_register_node}
 * - Assembles a deterministic {@link GossipMessage} payload
 * - Validates the embedded {@link EmoShard} and final gossip message
 *
 * No networking, P2P routing, or broadcast semantics are implemented.
 *
 * Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)
 *
 * @param sender - Candidate sender node info.
 * @returns A validated {@link GossipMessage} suitable for downstream broadcast.
 * @throws {MeshError} When validation fails.
 */
export async function mesh_propagate_gossip(sender: MeshNodeInfo): Promise<GossipMessage> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO P2P LOGIC
  // TODO(HGI): NO NETWORK OPERATIONS
  // TODO(HGI): Propagate gossip message
  // Reference: /docs/protocols/meshnet-outline.md (Section 3: Nodos)

  const registeredSender = await mesh_register_node(sender);

  if (!isValidMeshNodeInfo(registeredSender)) {
    throw createMeshInvalidNodeError('mesh_propagate_gossip failed to register a valid sender node.', registeredSender);
  }

  const ethical_score: HEVScore = {
    clarity_score: 0.8,
    coherence_score: 0.7,
    vulnerability_score: 0.2,
    toxicity_score: 0.1,
    ethical_color: EthicalGradient.GREEN_SAFE,
  };

  const shard: EmoShard = {
    emotion_vector: [0.25, 0.5, 0.75],
    intention_core: 'intention_alpha',
    ethical_score,
    bips_envelope: null,
    timestamp: 0,
  };

  if (!isValidEmoShard(shard)) {
    throw createMeshGossipError({ shard });
  }

  const message: GossipMessage = {
    message_id: 'gossip_alpha',
    sender_node_id: registeredSender.node_id,
    shard_payload: shard,
    timestamp: 0,
  };

  if (!isValidGossipMessage(message)) {
    throw createMeshGossipError({ message });
  }

  return message;
}

/**
 * Pipeline adapter entry for Mesh.
 *
 * Structure-only adapter:
 * - Validates an upstream {@link IrreversibilityEnvelope} payload (from BIPS)
 * - Registers a deterministic local node using {@link mesh_register_node}
 * - Builds and validates a deterministic gossip payload using {@link mesh_propagate_gossip}
 *
 * No networking, P2P routing, or node discovery is implemented.
 *
 * Reference:
 * - /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 * - /docs/protocols/meshnet-outline.md (Section 3: Nodos)
 *
 * @param input - Unknown upstream pipeline payload.
 * @returns A validated {@link MeshNodeInfo} representing the registered local node.
 * @throws {MeshError} When input or output validation fails.
 */
export async function mesh_pipeline_entry(input: unknown): Promise<MeshNodeInfo> {
  if (!isValidIrreversibilityEnvelope(input)) {
    throw new MeshError(
      MeshErrorCode.PIPELINE_INCOMPATIBLE,
      'Invalid IrreversibilityEnvelope input for Mesh pipeline entry.',
    );
  }

  const envelope: IrreversibilityEnvelope = {
    shard_id: input.shard_id,
    hash_contextual: input.hash_contextual,
    entropy_proof: input.entropy_proof,
    similarity_score: input.similarity_score,
  };

  if (!isValidShardID(envelope.shard_id)) {
    throw createMeshValidationError(`Invalid shard_id in IrreversibilityEnvelope: ${envelope.shard_id}`);
  }

  if (!isValidHashContextual(envelope.hash_contextual)) {
    throw createMeshValidationError(`Invalid hash_contextual in IrreversibilityEnvelope: ${envelope.hash_contextual}`);
  }

  const threshold = validateSimilarityThreshold(envelope.similarity_score);
  if (!threshold.ok) {
    throw createMeshValidationError(`Invalid similarity_score in IrreversibilityEnvelope: ${String(envelope.similarity_score)}`);
  }

  const node: MeshNodeInfo = {
    node_id: envelope.hash_contextual,
    node_type: NodeType.personal,
    reputation_score: clampReputationScore(0.5),
    ethical_weight: clampEthicalWeight(0.8),
  };

  if (!isValidMeshNodeInfo(node)) {
    throw createMeshInvalidNodeError('Mesh pipeline entry produced an invalid MeshNodeInfo scaffold.', node);
  }

  const registered = await mesh_register_node(node);
  if (!isValidMeshNodeInfo(registered)) {
    throw createMeshNodeStubError({ registered });
  }

  const gossip = await mesh_propagate_gossip(registered);
  if (!isValidGossipMessage(gossip)) {
    throw createMeshGossipError({ gossip });
  }

  return registered;
}

export {};
