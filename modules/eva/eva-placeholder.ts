// TODO: This module will implement EVA v1.
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Create tasks that reference `/docs/core/hgi-core-v0.2-outline.md` (Section 3: EVA).
// - Keep changes atomic and versionable.

export interface EVAInput {
  timestamp: number;
  duration_ms: number;
  sample_rate: number;
  // TODO(HGI): NO AUDIO PROCESSING
  // TODO(HGI): NO BIOMETRIC DATA
  // TODO(HGI): PLACEHOLDER ONLY
  // TODO(HGI): Metadata only (NO raw audio)
}

export interface ProsodyFeatures {
  pitch_mean: number;
  pitch_variance: number;
  energy_mean: number;
  rhythm_features: number[];
  // TODO(HGI): NO AUDIO PROCESSING
  // TODO(HGI): NO BIOMETRIC DATA
  // TODO(HGI): PLACEHOLDER ONLY
}

export interface EVAVector {
  pitch_mean: number;
  pitch_variance: number;
  energy_mean: number;
  rhythm_features: number[];
  // TODO(HGI): NO AUDIO PROCESSING
  // TODO(HGI): NO BIOMETRIC DATA
  // TODO(HGI): PLACEHOLDER ONLY
}

export async function extract_prosody_features(input: EVAInput): Promise<ProsodyFeatures> {
  // TODO(HGI): NO AUDIO PROCESSING
  // TODO(HGI): NO BIOMETRIC DATA
  // TODO(HGI): PLACEHOLDER ONLY
  // TODO(HGI): Implement prosodic feature extraction per Canon
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.1 EVA)
  void input;
  throw new Error("Not implemented");
}

export async function eva_vectorize(input: EVAInput): Promise<EVAVector> {
  // TODO(HGI): NO AUDIO PROCESSING
  // TODO(HGI): NO BIOMETRIC DATA
  // TODO(HGI): PLACEHOLDER ONLY
  // TODO(HGI): Vectorize EVA prosody features (metadata-derived only)
  // Reference: /docs/core/hgi-core-v0.2-outline.md (Section II.2.1 EVA)
  const prosody = await extract_prosody_features(input);
  return {
    pitch_mean: prosody.pitch_mean,
    pitch_variance: prosody.pitch_variance,
    energy_mean: prosody.energy_mean,
    rhythm_features: prosody.rhythm_features,
  };
}
