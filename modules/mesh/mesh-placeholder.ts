// TODO: This module will implement Umbilical Mesh + MeshNet integration surfaces.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md` (Section 6/8)
//   and `/docs/protocols/meshnet-outline.md`.
// - Keep changes atomic and versionable.

import type { EmoShard } from '../bips/bips-placeholder';
import { isValidEmoShard } from '../bips/bips-placeholder';

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
}

const NODE_TYPE_TO_STRING: Record<NodeType, string> = {
  [NodeType.personal]: 'personal',
  [NodeType.community]: 'community',
  [NodeType.elder]: 'elder',
};

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

export {};
