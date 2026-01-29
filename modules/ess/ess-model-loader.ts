import fs from 'node:fs/promises';

import type * as ortTypes from 'onnxruntime-node';

import type { EVAVector } from '../eva/eva-placeholder';
import { ONNXRuntimeManager } from '../runtime/onnx-config';

export interface ESSMLPModelConfig {
  modelPath: string;
}

export interface ESSMLPInferenceConfig {
  executionProviders?: readonly string[];
}

export interface ESSMLPOutputs {
  primaryWeight: number;
  intensityWeight: number;
  valence: number;
  secondaryWeights: Record<string, number>;
}

function clampToRange(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function sigmoid(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  return 1 / (1 + Math.exp(-x));
}

function toFixedFeatureVector(v: EVAVector, rhythmLen: number): Float32Array {
  const out: number[] = [v.pitch_mean, v.pitch_variance, v.energy_mean];

  const rhythm = Array.isArray(v.rhythm_features) ? v.rhythm_features : [];
  for (let i = 0; i < rhythmLen; i += 1) {
    out.push(typeof rhythm[i] === 'number' ? rhythm[i] : 0);
  }

  return new Float32Array(out);
}

export class ESSMLPModelLoader {
  private static instance: ESSMLPModelLoader | null = null;

  private readonly ortManager = ONNXRuntimeManager.getInstance();

  private session: ortTypes.InferenceSession | null = null;

  private sessionKey: { modelPath: string; executionProviders: readonly string[] } | null = null;

  private constructor() {
    // singleton
  }

  public static getInstance(): ESSMLPModelLoader {
    if (ESSMLPModelLoader.instance === null) {
      ESSMLPModelLoader.instance = new ESSMLPModelLoader();
    }
    return ESSMLPModelLoader.instance;
  }

  public static getConfiguredModelPath(): string | null {
    const p = process.env.ESS_MLP_ONNX_PATH;
    return typeof p === 'string' && p.trim().length > 0 ? p.trim() : null;
  }

  public async ensureSession(config?: Partial<ESSMLPModelConfig>, infer?: ESSMLPInferenceConfig): Promise<ortTypes.InferenceSession> {
    const modelPath = config?.modelPath ?? ESSMLPModelLoader.getConfiguredModelPath();
    if (modelPath === null) {
      throw new Error('ESS_MLP_ONNX_PATH is not configured.');
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

  public async inferFromEVAVector(vector: EVAVector, infer?: ESSMLPInferenceConfig): Promise<ESSMLPOutputs> {
    const session = await this.ensureSession(undefined, infer);

    const input = toFixedFeatureVector(vector, 8);

    const inputName = session.inputNames[0] ?? 'input';

    const ort = await import('onnxruntime-node');

    const feeds: Record<string, ortTypes.Tensor> = {
      [inputName]: new ort.Tensor('float32', input, [1, input.length]),
    };

    const results = await session.run(feeds);

    const outputName = (session.outputNames[0] ?? Object.keys(results)[0]) as string;
    const outTensor = results[outputName];

    if (!outTensor) {
      const keys = Object.keys(results);
      throw new Error(`ESS MLP session returned no usable output. outputs=${keys.join(', ')}`);
    }

    const data = outTensor.data as Float32Array;

    const primaryWeight = sigmoid(data[0] ?? 0);
    const intensityWeight = sigmoid(data[1] ?? primaryWeight);

    const valence = clampToRange(Math.tanh(data[2] ?? 0), -1, 1);

    const secondaryWeights: Record<string, number> = {
      joy: sigmoid(data[3] ?? 0),
      sadness: sigmoid(data[4] ?? 0),
    };

    return { primaryWeight, intensityWeight, valence, secondaryWeights };
  }
}

export const essMLPModelLoader = ESSMLPModelLoader.getInstance();
