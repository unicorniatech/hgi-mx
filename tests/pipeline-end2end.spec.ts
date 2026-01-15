import type { EVAInput } from '../modules/eva/eva-placeholder';
import { isValidEVAVector } from '../modules/eva/eva-placeholder';
import { isValidESSIntent } from '../modules/ess/ess-placeholder';
import { isValidHEVScore } from '../modules/hev/hev-placeholder';
import { isValidMOLIEMap } from '../modules/molie/molie-placeholder';
import { isValidIrreversibilityEnvelope } from '../modules/bips/bips-placeholder';
import { isValidMeshNodeInfo } from '../modules/mesh/mesh-placeholder';

import { pipeline_entry, run_pipeline_scaffold } from '../modules/pipeline';

/**
 * HGI-MX Phase 4.1 — Stub Pipeline End-to-End Test Harness.
 *
 * This harness is strictly structure-only:
 * - Executes the deterministic pipeline scaffold (EVA → ESS → HEV → MOLIE → BIPS → MESH)
 * - Validates each module output using existing Phase 3 validators
 * - Executes {@link pipeline_entry} end-to-end for the same input
 *
 * No audio processing, biometrics, hashing, networking, or irreversible logic is performed.
 *
 * Reference: /docs/core/hgi-core-v0.2-outline.md (Section III: Arquitectura General)
 */

function assertOk(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runHarness(): Promise<void> {
  const evaInput: EVAInput = {
    timestamp: 0,
    duration_ms: 10_000,
    sample_rate: 16_000,
  };

  const scaffold = await run_pipeline_scaffold(evaInput);

  assertOk(isValidEVAVector(scaffold.evaVector), 'EVA stage returned invalid EVAVector');
  assertOk(isValidESSIntent(scaffold.essIntent), 'ESS stage returned invalid ESSIntent');
  assertOk(isValidHEVScore(scaffold.hevScore), 'HEV stage returned invalid HEVScore');
  assertOk(isValidMOLIEMap(scaffold.molieMap), 'MOLIE stage returned invalid MOLIEMap');
  assertOk(
    isValidIrreversibilityEnvelope(scaffold.bipsEnvelope),
    'BIPS stage returned invalid IrreversibilityEnvelope',
  );
  assertOk(isValidMeshNodeInfo(scaffold.meshNode), 'MESH stage returned invalid MeshNodeInfo');

  const finalOutput = await pipeline_entry(evaInput);
  assertOk(isValidMeshNodeInfo(finalOutput), 'pipeline_entry did not return a MeshNodeInfo for full-chain run');

  const deterministic_output = {
    scaffold,
    finalOutput,
  } as const;

  void deterministic_output;
}

void runHarness();
