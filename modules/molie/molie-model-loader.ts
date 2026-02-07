import fs from 'node:fs/promises';

import type * as ortTypes from 'onnxruntime-node';

import { ONNXRuntimeManager } from '../runtime/onnx-config';
import { encodeVocabTokens, loadVocabFile } from '../tokenizers/vocab-tokenizer';

export interface Phi3ModelConfig {
  modelPath: string;
  vocabPath: string;
}

export interface Phi3InferenceConfig {
  executionProviders?: readonly string[];
  maxLength?: number;
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

export class MOLIEPhi3ModelLoader {
  private static instance: MOLIEPhi3ModelLoader | null = null;

  private readonly ortManager = ONNXRuntimeManager.getInstance();

  private session: ortTypes.InferenceSession | null = null;

  private sessionKey: { modelPath: string; vocabPath: string; executionProviders: readonly string[]; maxLength: number } | null = null;

  private vocab: Map<string, number> | null = null;

  private constructor() {
    // singleton
  }

  public static getInstance(): MOLIEPhi3ModelLoader {
    if (MOLIEPhi3ModelLoader.instance === null) {
      MOLIEPhi3ModelLoader.instance = new MOLIEPhi3ModelLoader();
    }
    return MOLIEPhi3ModelLoader.instance;
  }

  public static getConfiguredModelPath(): string | null {
    const p = process.env.MOLIE_PHI3_ONNX_PATH;
    return typeof p === 'string' && p.trim().length > 0 ? p.trim() : null;
  }

  public static getConfiguredVocabPath(): string | null {
    const p = process.env.MOLIE_PHI3_VOCAB_PATH;
    return typeof p === 'string' && p.trim().length > 0 ? p.trim() : null;
  }

  public async ensureSession(config?: Partial<Phi3ModelConfig>, infer?: Phi3InferenceConfig): Promise<ortTypes.InferenceSession> {
    const modelPath = config?.modelPath ?? MOLIEPhi3ModelLoader.getConfiguredModelPath();
    const vocabPath = config?.vocabPath ?? MOLIEPhi3ModelLoader.getConfiguredVocabPath();

    if (modelPath === null || vocabPath === null) {
      throw new Error('MOLIE_PHI3_ONNX_PATH/MOLIE_PHI3_VOCAB_PATH are not configured.');
    }

    await fs.access(modelPath);
    await fs.access(vocabPath);

    await this.ortManager.init();

    const eps = infer?.executionProviders ?? this.ortManager.getPreferredExecutionProviders();
    const maxLength = infer?.maxLength ?? 64;

    if (
      this.session !== null &&
      this.sessionKey?.modelPath === modelPath &&
      this.sessionKey?.vocabPath === vocabPath &&
      this.sessionKey?.maxLength === maxLength
    ) {
      const a = JSON.stringify([...this.sessionKey.executionProviders]);
      const b = JSON.stringify([...eps]);
      if (a === b) return this.session;
    }

    this.vocab = await loadVocabFile(vocabPath);

    const session = await this.ortManager.getSession(modelPath, eps);
    this.session = session;
    this.sessionKey = { modelPath, vocabPath, executionProviders: eps, maxLength };

    return session;
  }

  public async inferClusterWeights(text: string, infer?: Phi3InferenceConfig): Promise<readonly number[]> {
    const session = await this.ensureSession(undefined, infer);
    if (this.vocab === null || this.sessionKey === null) {
      throw new Error('MOLIE Phi-3 loader not ready after ensureSession().');
    }

    const maxLength = this.sessionKey.maxLength;
    const { inputIds, attentionMask } = encodeVocabTokens(text, this.vocab, maxLength);

    const ort = await import('onnxruntime-node');

    const inputIdsName =
      session.inputNames.find((n: string) => /input_ids/i.test(n)) ?? session.inputNames[0] ?? 'input_ids';
    const maskName =
      session.inputNames.find((n: string) => /attention_mask/i.test(n)) ?? session.inputNames[1] ?? 'attention_mask';

    const feeds: Record<string, ortTypes.Tensor> = {
      [inputIdsName]: new ort.Tensor('int64', inputIds, [1, maxLength]),
      [maskName]: new ort.Tensor('int64', attentionMask, [1, maxLength]),
    };

    const results = await session.run(feeds);
    const outName = (session.outputNames[0] ?? Object.keys(results)[0]) as string;
    const outTensor = results[outName];

    if (!outTensor) {
      const keys = Object.keys(results);
      throw new Error(`MOLIE Phi-3 session returned no usable output. outputs=${keys.join(', ')}`);
    }

    const data = outTensor.data as Float32Array;

    const w0 = clamp01(sigmoid(data[0] ?? 0));
    const w1 = clamp01(sigmoid(data[1] ?? 0));
    const w2 = clamp01(sigmoid(data[2] ?? 0));

    return [w0, w1, w2];
  }
}

export const moliePhi3ModelLoader = MOLIEPhi3ModelLoader.getInstance();
