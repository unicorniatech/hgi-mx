import type { EVAInput, EVAVector } from './eva/eva-placeholder';
import { eva_pipeline_entry } from './eva/eva-placeholder';
import type { ESSIntent } from './ess/ess-placeholder';
import { ess_pipeline_entry } from './ess/ess-placeholder';
import type { HEVScore } from './hev/hev-placeholder';
import { hev_pipeline_entry } from './hev/hev-placeholder';
import type { MOLIEMap } from './molie/molie-placeholder';
import { molie_pipeline_entry } from './molie/molie-placeholder';
import type { EmoShard } from './bips/bips-placeholder';
import type { IrreversibilityEnvelope } from './bips/bips-placeholder';
import { bips_pipeline_entry } from './bips/bips-placeholder';
import type { GossipMessage, MeshNodeInfo } from './mesh/mesh-placeholder';
import { mesh_pipeline_entry } from './mesh/mesh-placeholder';

/**
 * Stable error codes for pipeline structural/validation failures.
 */
export enum PipelineErrorCode {
  ORDER_VIOLATION = 'ORDER_VIOLATION',
  TYPE_VIOLATION = 'TYPE_VIOLATION',
  CHAIN_VALIDATION_FAIL = 'CHAIN_VALIDATION_FAIL',
  MODULE_DISPATCH_ERROR = 'MODULE_DISPATCH_ERROR',
  CANON_VIOLATION = 'CANON_VIOLATION',
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

export interface FullHandoffChainValidationResult {
  ok: boolean;
  violations: string[];
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
 * Factory for a full-chain validation error.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * @param violations - Human-readable validation violations.
 * @returns A {@link PipelineError} with code {@link PipelineErrorCode.CHAIN_VALIDATION_FAIL}.
 */
export function createPipelineChainError(violations: string[]): PipelineError {
  const details = violations.length > 0 ? violations.join(' | ') : 'Unknown chain validation failure.';
  return new PipelineError(PipelineErrorCode.CHAIN_VALIDATION_FAIL, `Pipeline chain validation failed: ${details}`);
}

/**
 * Factory for a module dispatch error.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * @param module - The module/stage being dispatched.
 * @param error - Optional underlying error.
 * @returns A {@link PipelineError} with code {@link PipelineErrorCode.MODULE_DISPATCH_ERROR}.
 */
export function createPipelineDispatchError(module: string, error?: unknown): PipelineError {
  const message = error instanceof Error ? error.message : error === undefined ? 'Unknown error' : String(error);
  return new PipelineError(
    PipelineErrorCode.MODULE_DISPATCH_ERROR,
    `Pipeline module dispatch failed (${module}): ${message}`,
  );
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
 * Validate a full pipeline handoff chain.
 *
 * This function performs structure-only validation:
 * - Runs sequential {@link isCompatibleHandoff} checks for each adjacent stage
 * - Optionally validates that each stage has Canon metadata using {@link hasCanonReference}
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * @param stages - Pipeline stage names in execution order.
 * @param stageMetadata - Optional per-stage metadata map (e.g. `{ EVA: { canon_section: "..." } }`).
 * @returns A structured result when validation passes.
 * @throws {PipelineError} When a handoff or Canon metadata violation is detected.
 */
export function validate_full_handoff_chain(
  stages: string[],
): FullHandoffChainValidationResult {
  const violations: string[] = [];

  const canonByStage: Readonly<Record<string, unknown>> = Object.freeze({
    EVA: { canon_section: 'II.2.1' },
    ESS: { canon_section: 'II.2.2' },
    HEV: { canon_section: 'IX' },
    MOLIE: { canon_section: 'V' },
    BIPS: { canon_section: 'V' },
    MESH: { canon_section: 'VI' },
  });

  for (let i = 0; i < stages.length - 1; i += 1) {
    const from = stages[i];
    const to = stages[i + 1];
    const compat = isCompatibleHandoff(from, to);
    if (!compat.ok) {
      violations.push(compat.details ?? `Incompatible handoff: ${from} -> ${to}`);
    }
  }

  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    const meta = canonByStage[stage];
    if (!hasCanonReference(meta)) {
      violations.push(`Missing Canon reference metadata for stage: ${stage}`);
    }
  }

  const ok = violations.length === 0;
  if (!ok) {
    const canonViolations = violations.filter((v) => v.startsWith('Missing Canon reference metadata for stage:'));
    if (canonViolations.length > 0) {
      throw new PipelineError(
        PipelineErrorCode.CANON_VIOLATION,
        `Pipeline Canon metadata validation failed: ${canonViolations.join(' | ')}`,
      );
    }

    throw createPipelineChainError(violations);
  }

  return { ok, violations };
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

export interface PipelineScaffoldResult {
  evaVector: EVAVector;
  essIntent: ESSIntent;
  hevScore: HEVScore;
  molieMap: MOLIEMap;
  bipsEnvelope: IrreversibilityEnvelope;
  meshNode: MeshNodeInfo;
}

function validateStagesSubsequence(stages: string[]): PipelineOrderValidationResult {
  const expected = ['EVA', 'ESS', 'HEV', 'MOLIE', 'BIPS', 'MESH'] as const;
  const actual = [...stages];

  const seen = new Set<string>();
  const indices: number[] = [];
  for (const stage of actual) {
    if (seen.has(stage)) return { ok: false, expected: [...expected], actual };
    seen.add(stage);
    const idx = expected.indexOf(stage as (typeof expected)[number]);
    if (idx === -1) return { ok: false, expected: [...expected], actual };
    indices.push(idx);
  }

  const ok = indices.every((idx, i) => (i === 0 ? true : idx > indices[i - 1]));
  return { ok, expected: [...expected], actual };
}

/**
 * Run a structure-only pipeline scaffold using deterministic stage adapters.
 *
 * This orchestrator performs validation + wiring only:
 * - Validates the canonical pipeline order
 * - Validates required handoff compatibility
 * - Calls stage `*_pipeline_entry` adapters in canonical order
 *
 * No real processing, scoring, hashing, networking, or side effects are executed.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * @param input - The EVA input payload (metadata-only).
 * @returns A full deterministic pipeline result bundle.
 * @throws {PipelineError} When order, compatibility, or stage validation fails.
 */
export async function run_pipeline_scaffold(input: EVAInput): Promise<PipelineScaffoldResult> {
  const stages = ['EVA', 'ESS', 'HEV', 'MOLIE', 'BIPS', 'MESH'];
  const order = validatePipelineOrder(stages);
  if (!order.ok) {
    throw createPipelineOrderError(order.expected, order.actual);
  }

  const compatEVAESS = isCompatibleHandoff('EVA', 'ESS');
  if (!compatEVAESS.ok) throw createPipelineTypeError('EVA', 'ESS', compatEVAESS.details);

  const compatESSHEV = isCompatibleHandoff('ESS', 'HEV');
  if (!compatESSHEV.ok) throw createPipelineTypeError('ESS', 'HEV', compatESSHEV.details);

  const compatESSMOLIE = isCompatibleHandoff('ESS', 'MOLIE');
  if (!compatESSMOLIE.ok) throw createPipelineTypeError('ESS', 'MOLIE', compatESSMOLIE.details);

  const compatHEVBIPS = isCompatibleHandoff('HEV', 'BIPS');
  if (!compatHEVBIPS.ok) throw createPipelineTypeError('HEV', 'BIPS', compatHEVBIPS.details);

  const compatMOLIEBIPS = isCompatibleHandoff('MOLIE', 'BIPS');
  if (!compatMOLIEBIPS.ok) throw createPipelineTypeError('MOLIE', 'BIPS', compatMOLIEBIPS.details);

  const compatBIPSMESH = isCompatibleHandoff('BIPS', 'MESH');
  if (!compatBIPSMESH.ok) throw createPipelineTypeError('BIPS', 'MESH', compatBIPSMESH.details);

  try {
    const evaVector = await eva_pipeline_entry(input);
    const essIntent = await ess_pipeline_entry(evaVector);
    const hevScore = await hev_pipeline_entry(essIntent);
    const molieMap = await molie_pipeline_entry(essIntent);
    const bipsEnvelope = await bips_pipeline_entry({ molieMap, hevScore });
    const meshNode = await mesh_pipeline_entry(bipsEnvelope);

    return { evaVector, essIntent, hevScore, molieMap, bipsEnvelope, meshNode };
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    throw createPipelineDispatchError('SCAFFOLD', err);
  }
}

/**
 * Pipeline entry wrapper.
 *
 * Structure-only pipeline orchestration:
 * - Validates stage order against the canonical sequence
 * - Validates full handoff compatibility + Canon metadata via {@link validate_full_handoff_chain}
 * - Dynamically dispatches to each stage `*_pipeline_entry`
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 *
 * @param input - Unknown upstream payload (typically EVAInput for full-chain runs).
 * @param stages - Optional stage list. Defaults to full chain.
 * @returns The output of the final stage.
 * @throws {PipelineError} When validation or stage execution fails.
 */
export async function pipeline_entry(input: unknown, stages?: string[]): Promise<unknown> {
  const defaultStages = ['EVA', 'ESS', 'HEV', 'MOLIE', 'BIPS', 'MESH'];
  const chosen = stages ?? defaultStages;

  const order = validateStagesSubsequence(chosen);
  if (!order.ok) {
    throw createPipelineOrderError(order.expected, order.actual);
  }

  validate_full_handoff_chain(chosen);

  const results: Partial<PipelineScaffoldResult> = {};
  let current: unknown = input;

  try {
    for (const stage of chosen) {
      if (stage === 'EVA') {
        const out = await eva_pipeline_entry(current);
        results.evaVector = out;
        current = out;
        continue;
      }

      if (stage === 'ESS') {
        const out = await ess_pipeline_entry(current);
        results.essIntent = out;
        current = out;
        continue;
      }

      if (stage === 'HEV') {
        const out = await hev_pipeline_entry(current);
        results.hevScore = out;
        current = out;
        continue;
      }

      if (stage === 'MOLIE') {
        const out = await molie_pipeline_entry(current);
        results.molieMap = out;
        current = out;
        continue;
      }

      if (stage === 'BIPS') {
        const molieMap = results.molieMap;
        const hevScore = results.hevScore;
        if (molieMap === undefined || hevScore === undefined) {
          throw createPipelineTypeError(
            'BIPS',
            'INPUT',
            'BIPS requires both MOLIEMap and HEVScore from upstream stages.',
          );
        }
        const out = await bips_pipeline_entry({ molieMap, hevScore });
        results.bipsEnvelope = out;
        current = out;
        continue;
      }

      if (stage === 'MESH') {
        const out = await mesh_pipeline_entry(current);
        results.meshNode = out;
        current = out;
        continue;
      }

      throw createPipelineTypeError('PIPELINE', stage, 'Unknown pipeline stage.');
    }

    return current;
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    const stage = typeof chosen[chosen.length - 1] === 'string' ? chosen[chosen.length - 1] : 'UNKNOWN';
    throw createPipelineDispatchError(stage, err);
  }
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
