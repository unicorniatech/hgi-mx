// TODO: This module will implement MOLIE v1.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md`.
// - Keep changes atomic and versionable.

import { ESSIntent } from '../ess/ess-placeholder';

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

/**
 * Check whether a value is an array of strings.
 *
 * @param value - The value to check.
 * @returns `true` when `value` is a `string[]`.
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Structured validation error for MOLIE input validation.
 */
export interface MOLIEValidationError {
  code: string;
  message: string;
  index?: number;
  value?: string;
}

/**
 * Result object for MOLIE validation helpers.
 */
export interface MOLIEValidationResult {
  ok: boolean;
  errors: MOLIEValidationError[];
}

/**
 * Stable error codes for MOLIE structural/validation failures.
 */
export enum MOLIEErrorCode {
  INVALID_ID = 'INVALID_ID',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  WEIGHT_VIOLATION = 'WEIGHT_VIOLATION',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',
}

/**
 * MOLIE error type for structural/validation failures.
 *
 * This error class is intended for input/shape/range validation only.
 * It does not imply any semantic interpretation of MOLIE content.
 */
export class MOLIEError extends Error {
  public readonly code: MOLIEErrorCode;

  public readonly timestamp: Date;

  /**
   * Create a new {@link MOLIEError}.
   *
   * @param code - Stable MOLIE error code.
   * @param message - Human-readable message.
   * @param timestamp - Optional timestamp override.
   */
  public constructor(code: MOLIEErrorCode, message: string, timestamp: Date = new Date()) {
    super(message);
    this.name = 'MOLIEError';
    this.code = code;
    this.timestamp = timestamp;

    // Ensure prototype chain is correct when targeting older JS runtimes.
    Object.setPrototypeOf(this, MOLIEError.prototype);
  }
}

/**
 * Factory for a generic MOLIE validation error.
 *
 * @param message - Human-readable message.
 * @returns A {@link MOLIEError} with code {@link MOLIEErrorCode.VALIDATION_ERROR}.
 */
export function createMOLIEValidationError(message: string): MOLIEError {
  return new MOLIEError(MOLIEErrorCode.VALIDATION_ERROR, message);
}

/**
 * Factory for an invalid MOLIE identifier error.
 *
 * @param idType - The identifier type being validated.
 * @param id - The offending identifier.
 * @returns A {@link MOLIEError} with code {@link MOLIEErrorCode.INVALID_ID}.
 */
export function createMOLIEInvalidIDError(
  idType: 'node' | 'cluster',
  id: string,
): MOLIEError {
  return new MOLIEError(MOLIEErrorCode.INVALID_ID, `Invalid ${idType} id: ${id}`);
}

const MOLIE_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export const MOLIE_WEIGHT_MIN = 0.0;

export const MOLIE_WEIGHT_MAX = 1.0;

function clampWeight(weight: number): number {
  if (weight < MOLIE_WEIGHT_MIN) return MOLIE_WEIGHT_MIN;
  if (weight > MOLIE_WEIGHT_MAX) return MOLIE_WEIGHT_MAX;
  return weight;
}

/**
 * Clamp an intention node semantic weight into the supported MOLIE range.
 *
 * Range: `[MOLIE_WEIGHT_MIN, MOLIE_WEIGHT_MAX]` (defaults to `[0.0, 1.0]`).
 *
 * @param weight - The raw semantic weight.
 * @returns The clamped semantic weight.
 */
export function clampSemanticWeight(weight: number): number {
  return clampWeight(weight);
}

/**
 * Clamp a semantic cluster weight into the supported MOLIE range.
 *
 * Range: `[MOLIE_WEIGHT_MIN, MOLIE_WEIGHT_MAX]` (defaults to `[0.0, 1.0]`).
 *
 * @param weight - The raw cluster weight.
 * @returns The clamped cluster weight.
 */
export function clampClusterWeight(weight: number): number {
  return clampWeight(weight);
}

/**
 * Normalize an {@link IntentionNode} into a canonical structural form.
 *
 * This performs structural normalization only:
 * - Clamps `semantic_weight` into the supported range.
 * - Returns a new object (does not mutate the input).
 *
 * @param node - The intention node to normalize.
 * @returns A normalized copy of `node`.
 */
export function normalizeIntentionNode(node: IntentionNode): IntentionNode {
  return {
    ...node,
    semantic_weight: clampSemanticWeight(node.semantic_weight),
    connections: [...node.connections],
  };
}

/**
 * Normalize a {@link SemanticCluster} into a canonical structural form.
 *
 * This performs structural normalization only:
 * - Clamps `cluster_weight` into the supported range.
 * - Returns a new object (does not mutate the input).
 *
 * @param cluster - The semantic cluster to normalize.
 * @returns A normalized copy of `cluster`.
 */
export function normalizeSemanticCluster(cluster: SemanticCluster): SemanticCluster {
  return {
    ...cluster,
    cluster_weight: clampClusterWeight(cluster.cluster_weight),
    node_ids: [...cluster.node_ids],
  };
}

/**
 * Validate a MOLIE intention node ID.
 *
 * Format:
 * - Alphanumeric plus `_` and `-`
 * - Length 1-128 characters
 *
 * @param id - The node ID to validate.
 * @returns `true` when `id` matches the required format.
 */
export function isValidNodeID(id: string): boolean {
  return MOLIE_ID_REGEX.test(id);
}

/**
 * Validate a MOLIE semantic cluster ID.
 *
 * Format:
 * - Alphanumeric plus `_` and `-`
 * - Length 1-128 characters
 *
 * @param id - The cluster ID to validate.
 * @returns `true` when `id` matches the required format.
 */
export function isValidClusterID(id: string): boolean {
  return MOLIE_ID_REGEX.test(id);
}

/**
 * Validate an intention node's `connections` list.
 *
 * This performs structural validation only:
 * - Each connection must be a valid node ID.
 *
 * @param connections - Array of node IDs referenced by an intention node.
 * @returns A structured validation result.
 */
export function validateNodeConnections(connections: string[]): MOLIEValidationResult {
  const errors: MOLIEValidationError[] = [];

  for (let i = 0; i < connections.length; i += 1) {
    const id = connections[i];
    if (!isValidNodeID(id)) {
      errors.push({
        code: 'INVALID_NODE_ID',
        message: 'Connection ID must be alphanumeric plus _- and 1-128 characters.',
        index: i,
        value: id,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Runtime validator / type guard for {@link IntentionNode}.
 *
 * This guard validates only the structural shape of the node (types of fields).
 * It does not enforce semantic meaning or business rules.
 *
 * @param node - The value to validate.
 * @returns `true` when `node` matches the {@link IntentionNode} structure.
 */
export function isValidIntentionNode(node: unknown): node is IntentionNode {
  if (!isRecord(node)) return false;

  return (
    typeof node.id === 'string' &&
    isFiniteNumber(node.semantic_weight) &&
    typeof node.emotional_anchor === 'string' &&
    isStringArray(node.connections)
  );
}

/**
 * Runtime validator / type guard for {@link SemanticCluster}.
 *
 * This guard validates only the structural shape of the cluster (types of fields).
 * It does not enforce semantic meaning or business rules.
 *
 * @param cluster - The value to validate.
 * @returns `true` when `cluster` matches the {@link SemanticCluster} structure.
 */
export function isValidSemanticCluster(cluster: unknown): cluster is SemanticCluster {
  if (!isRecord(cluster)) return false;

  return (
    typeof cluster.id === 'string' &&
    isStringArray(cluster.node_ids) &&
    isFiniteNumber(cluster.cluster_weight)
  );
}

/**
 * Runtime validator / type guard for {@link MOLIEMap}.
 *
 * This guard validates only the structural shape of the map (types of fields).
 * It does not enforce semantic meaning or business rules.
 *
 * @param map - The value to validate.
 * @returns `true` when `map` matches the {@link MOLIEMap} structure.
 */
export function isValidMOLIEMap(map: unknown): map is MOLIEMap {
  if (!isRecord(map)) return false;

  const intentionNodes = map.intention_nodes;
  const semanticClusters = map.semantic_clusters;

  return (
    Array.isArray(intentionNodes) &&
    intentionNodes.every(isValidIntentionNode) &&
    Array.isArray(semanticClusters) &&
    semanticClusters.every(isValidSemanticCluster) &&
    isStringArray(map.narrative_threads)
  );
}

export interface IntentionNode {
  id: string;
  semantic_weight: number;
  emotional_anchor: string;
  connections: string[];
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO SEMANTIC LOGIC
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section XI: MOLIE)
}

export interface SemanticCluster {
  id: string;
  node_ids: string[];
  cluster_weight: number;
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO SEMANTIC LOGIC
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section XI: MOLIE)
}

export interface MOLIEMap {
  intention_nodes: IntentionNode[];
  semantic_clusters: SemanticCluster[];
  narrative_threads: string[];
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO SEMANTIC LOGIC
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section XI: MOLIE)
}

export async function extract_semantic_clusters(intent: ESSIntent): Promise<SemanticCluster[]> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO SEMANTIC LOGIC
  // TODO(HGI): Extract semantic clusters from ESS intent
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section XI: MOLIE)
  void intent;
  throw new Error("Not implemented");
}

export async function molie_transform(essOutput: ESSIntent): Promise<MOLIEMap> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO SEMANTIC LOGIC
  // TODO(HGI): Implement deep semantic intention mapping
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section XI: MOLIE)
  void essOutput;
  throw new Error("Not implemented");
}

export {};
