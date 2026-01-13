import type { EVAInput, EVAVector } from './eva/eva-placeholder';
import type { ESSIntent } from './ess/ess-placeholder';
import type { HEVScore } from './hev/hev-placeholder';
import type { MOLIEMap } from './molie/molie-placeholder';
import type { EmoShard } from './bips/bips-placeholder';
import type { GossipMessage, MeshNodeInfo } from './mesh/mesh-placeholder';

/**
 * Stable error codes for pipeline structural/validation failures.
 */
export enum PipelineErrorCode {
  ORDER_VIOLATION = 'ORDER_VIOLATION',
  TYPE_VIOLATION = 'TYPE_VIOLATION',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',
}

/**
 * Pipeline-scoped error type for structural/validation failures.
 *
 * This is validation infrastructure only. It does not execute pipeline logic.
 */
export class PipelineError extends Error {
  public readonly code: PipelineErrorCode;

  public readonly timestamp: Date;

  /**
   * Create a new {@link PipelineError}.
   *
   * @param code - Stable pipeline error code.
   * @param message - Human-readable message.
   * @param timestamp - Optional timestamp override.
   */
  public constructor(code: PipelineErrorCode, message: string, timestamp: Date = new Date()) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.timestamp = timestamp;

    // Ensure prototype chain is correct when targeting older JS runtimes.
    Object.setPrototypeOf(this, PipelineError.prototype);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface PipelineOrderValidationResult {
  ok: boolean;
  expected: string[];
  actual: string[];
}

export interface PipelineHandoffCompatibilityResult {
  ok: boolean;
  details?: string;
}

/**
 * Validate that a pipeline stage list matches the canonical HGI module order.
 *
 * Canonical order:
 * - EVA
 * - ESS
 * - HEV
 * - MOLIE
 * - BIPS
 * - MESH
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * This function performs validation only and does not execute any pipeline logic.
 *
 * @param stages - The stages to validate.
 * @returns A structured validation result including expected and actual orders.
 */
export function validatePipelineOrder(stages: string[]): PipelineOrderValidationResult {
  const expected = ['EVA', 'ESS', 'HEV', 'MOLIE', 'BIPS', 'MESH'] as const;
  const actual = [...stages];

  const ok =
    actual.length === expected.length &&
    actual.every((stage, idx) => stage === expected[idx]);

  return { ok, expected: [...expected], actual };
}

/**
 * Factory for an invalid pipeline order error.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * @param expected - The expected pipeline stage order.
 * @param actual - The actual pipeline stage order.
 * @returns A {@link PipelineError} with code {@link PipelineErrorCode.ORDER_VIOLATION}.
 */
export function createPipelineOrderError(expected: string[], actual: string[]): PipelineError {
  return new PipelineError(
    PipelineErrorCode.ORDER_VIOLATION,
    `Invalid pipeline order. Expected: ${expected.join(' -> ')}. Actual: ${actual.join(' -> ')}`,
  );
}

/**
 * Factory for an invalid pipeline handoff/type error.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * @param from - Source module name.
 * @param to - Destination module name.
 * @param details - Optional additional detail.
 * @returns A {@link PipelineError} with code {@link PipelineErrorCode.TYPE_VIOLATION}.
 */
export function createPipelineTypeError(from: string, to: string, details?: string): PipelineError {
  const suffix = details ? ` (${details})` : '';
  return new PipelineError(PipelineErrorCode.TYPE_VIOLATION, `Invalid pipeline handoff: ${from} -> ${to}${suffix}`);
}

/**
 * Check whether metadata includes a Canon reference.
 *
 * Structural validation only: this verifies `metadata` is a record with a
 * string `canon_section` field.
 *
 * Reference: /HGI_CANON_ROOT.md
 *
 * @param metadata - Arbitrary metadata to validate.
 * @returns `true` when `metadata` contains a string `canon_section` field.
 */
export function hasCanonReference(metadata: unknown): boolean {
  if (!isRecord(metadata)) return false;
  const canonSection = metadata.canon_section;
  return typeof canonSection === 'string' && canonSection.trim().length > 0;
}

/**
 * Validate whether two pipeline modules have a compatible handoff relationship.
 *
 * Canon handoff types (Section III):
 * - EVA: EVAInput -> EVAVector
 * - ESS: EVAVector -> ESSIntent
 * - HEV: ESSIntent -> HEVScore
 * - MOLIE: ESSIntent -> MOLIEMap
 * - BIPS: (MOLIEMap + HEVScore + ESSIntent) -> EmoShard
 * - MESH: EmoShard -> GossipMessage (broadcast) / MeshNodeInfo (peers)
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * This function performs validation only and does not execute any pipeline logic.
 *
 * @param from - Source module name (e.g. `EVA`).
 * @param to - Destination module name (e.g. `ESS`).
 * @returns A structured compatibility result.
 */
export function isCompatibleHandoff(from: string, to: string): PipelineHandoffCompatibilityResult {
  const handoffs: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
    EVA: ['ESS'],
    ESS: ['HEV', 'MOLIE'],
    HEV: ['MOLIE', 'BIPS'],
    MOLIE: ['BIPS'],
    BIPS: ['MESH'],
    MESH: [],
  });

  const allowedTargets = handoffs[from];
  if (allowedTargets === undefined) {
    return { ok: false, details: `Unknown module: ${from}` };
  }

  const ok = allowedTargets.includes(to);
  if (!ok) {
    const expected = allowedTargets.length === 0 ? '(no outgoing handoffs)' : allowedTargets.join(', ');
    return { ok: false, details: `Incompatible handoff: ${from} -> ${to}. Expected: ${from} -> ${expected}.` };
  }

  return { ok: true };
}

export async function execute_hgi_pipeline(input: EVAInput): Promise<EmoShard> {
  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO PIPELINE LOGIC
  // Flow: EVA → ESS → HEV → MOLIE → BIPS → Mesh
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)

  // TODO(HGI): STRUCTURE ONLY
  // TODO(HGI): NO PIPELINE LOGIC
  // Dependency mapping (handoff types):
  // - EVA: EVAInput -> EVAVector
  // - ESS: EVAVector -> ESSIntent
  // - HEV: ESSIntent -> HEVScore
  // - MOLIE: ESSIntent -> MOLIEMap
  // - BIPS: (MOLIEMap + HEVScore + ESSIntent) -> EmoShard
  // - Mesh: EmoShard -> GossipMessage (broadcast) / MeshNodeInfo (peers)

  // EVA stage output
  const evaVector = null as unknown as EVAVector;
  // ESS stage output
  const essIntent = null as unknown as ESSIntent;
  // HEV stage output
  const hevScore = null as unknown as HEVScore;
  // MOLIE stage output
  const molieMap = null as unknown as MOLIEMap;
  // BIPS stage output
  const emoShard = null as unknown as EmoShard;

  // Mesh stage payloads (downstream)
  const gossipMessage = null as unknown as GossipMessage;
  const discoveredPeers = null as unknown as MeshNodeInfo[];

  void evaVector;
  void essIntent;
  void hevScore;
  void molieMap;
  void emoShard;
  void gossipMessage;
  void discoveredPeers;
  void input;
  throw new Error("Not implemented");
}
