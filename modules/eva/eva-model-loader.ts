import fs from 'node:fs/promises';

import type * as ortTypes from 'onnxruntime-node';

import { ONNXRuntimeManager } from '../runtime/onnx-config';

const EVA_WAV2VEC2_MAX_INPUT_SECONDS = 20;
const EVA_WAV2VEC2_MAX_INPUT_SAMPLES = 320_000;

export interface Wav2Vec2ModelConfig {
  modelPath: string;
}

export interface Wav2Vec2InferenceConfig {
  executionProviders?: readonly string[];
}

export interface Wav2Vec2Embeddings {
  vector: Float32Array;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function sigmoid(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  return 1 / (1 + Math.exp(-x));
}

function meanPoolLastDim3D(tensor: ortTypes.Tensor): Float32Array {
  const dims = tensor.dims;
  const data = tensor.data as Float32Array;

  if (dims.length !== 3) {
    throw new Error(`Expected 3D tensor for Wav2Vec2 embeddings, got dims=${JSON.stringify(dims)}`);
  }

  const batch = dims[0];
  const time = dims[1];
  const hidden = dims[2];

  if (batch !== 1) {
    throw new Error(`Expected batch size 1 for Wav2Vec2 embeddings, got batch=${batch}`);
  }

  const out = new Float32Array(hidden);
  const frames = Math.max(1, time);

  for (let t = 0; t < time; t += 1) {
    const base = t * hidden;
    for (let h = 0; h < hidden; h += 1) {
      out[h] += data[base + h];
    }
  }

  for (let h = 0; h < hidden; h += 1) {
    out[h] /= frames;
  }

  return out;
}

function makeSilenceWaveform(sampleRate: number, durationMs: number): Float32Array {
  const rawSamples = Math.round((durationMs / 1000) * sampleRate);
  const maxBySeconds = Math.round(EVA_WAV2VEC2_MAX_INPUT_SECONDS * sampleRate);
  const capped = Math.min(rawSamples, maxBySeconds, EVA_WAV2VEC2_MAX_INPUT_SAMPLES);
  const samples = Math.max(1, capped);
  return new Float32Array(samples);
}

export class EVAWav2Vec2ModelLoader {
  private static instance: EVAWav2Vec2ModelLoader | null = null;

  private readonly ortManager = ONNXRuntimeManager.getInstance();

  private session: ortTypes.InferenceSession | null = null;

  private sessionKey: { modelPath: string; executionProviders: readonly string[] } | null = null;

  private constructor() {
    // singleton
  }

  public static getInstance(): EVAWav2Vec2ModelLoader {
    if (EVAWav2Vec2ModelLoader.instance === null) {
      EVAWav2Vec2ModelLoader.instance = new EVAWav2Vec2ModelLoader();
    }
    return EVAWav2Vec2ModelLoader.instance;
  }

  public static getConfiguredModelPath(): string | null {
    const p = process.env.EVA_WAV2VEC2_ONNX_PATH;
    return typeof p === 'string' && p.trim().length > 0 ? p.trim() : null;
  }

  public async ensureSession(config?: Partial<Wav2Vec2ModelConfig>, infer?: Wav2Vec2InferenceConfig): Promise<ortTypes.InferenceSession> {
    const modelPath = config?.modelPath ?? EVAWav2Vec2ModelLoader.getConfiguredModelPath();
    if (modelPath === null) {
      throw new Error('EVA_WAV2VEC2_ONNX_PATH is not configured.');
    }

    await fs.access(modelPath);

    await this.ortManager.init();

    const eps = infer?.executionProviders ?? this.ortManager.getPreferredExecutionProviders();

    if (this.session !== null && this.sessionKey?.modelPath === modelPath) {
      const a = JSON.stringify([...this.sessionKey.executionProviders]);
      const b = JSON.stringify([...eps]);
      if (a === b) return this.session;
    }

    const session = await this.ortManager.getSession(modelPath, eps);
    this.session = session;
    this.sessionKey = { modelPath, executionProviders: eps };

    return session;
  }

  public async inferEmbeddingsFromMetadata(
    sampleRate: number,
    durationMs: number,
    infer?: Wav2Vec2InferenceConfig,
  ): Promise<Wav2Vec2Embeddings> {
    const session = await this.ensureSession(undefined, infer);

    const waveform = makeSilenceWaveform(sampleRate, durationMs);

    const inputName = session.inputNames[0] ?? 'input_values';

    const feeds: Record<string, ortTypes.Tensor> = {
      [inputName]: new (await import('onnxruntime-node')).Tensor('float32', waveform, [1, waveform.length]),
    };

    const results = await session.run(feeds);

    const outputName =
      (session.outputNames.find((n: string) => /last_hidden_state/i.test(n)) ??
        session.outputNames.find((n: string) => /embeddings/i.test(n)) ??
        session.outputNames[0]) as string;

    const outTensor = results[outputName];
    if (!outTensor) {
      const keys = Object.keys(results);
      throw new Error(`Wav2Vec2 session returned no usable output. outputs=${keys.join(', ')}`);
    }

    const pooled = meanPoolLastDim3D(outTensor);
    return { vector: pooled };
  }

  public embeddingsToProsody(vector: Float32Array): {
    pitch_mean: number;
    pitch_variance: number;
    energy_mean: number;
    rhythm_features: number[];
  } {
    const get = (idx: number): number => (idx >= 0 && idx < vector.length ? vector[idx] : 0);

    const pitchMean = clamp01(sigmoid(get(0)));
    const pitchVar = clamp01(Math.abs(Math.tanh(get(1))));
    const energy = clamp01(sigmoid(get(2)));

    const rhythm: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      rhythm.push(clamp01(sigmoid(get(3 + i))));
    }

    return {
      pitch_mean: pitchMean,
      pitch_variance: pitchVar,
      energy_mean: energy,
      rhythm_features: rhythm,
    };
  }
}

export const evaWav2Vec2ModelLoader = EVAWav2Vec2ModelLoader.getInstance();
