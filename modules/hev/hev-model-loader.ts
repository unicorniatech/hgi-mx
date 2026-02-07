import fs from 'node:fs/promises';

import type * as ortTypes from 'onnxruntime-node';

import { ONNXRuntimeManager } from '../runtime/onnx-config';
import { basicTokenize } from '../tokenizers/basic-tokenizer';
import { encodeWordpieceBert, loadVocabFile } from '../tokenizers/vocab-tokenizer';

export interface HEVDistilBertModelConfig {
  modelPath: string;
  vocabPath: string;
}

export interface HEVDistilBertInferenceConfig {
  executionProviders?: readonly string[];
  maxLength?: number;
}

export interface HEVClassifierResult {
  toxicityScore: number;
  coherenceScore: number;
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

function softmax2(a: number, b: number): [number, number] {
  const max = Math.max(a, b);
  const ea = Math.exp(a - max);
  const eb = Math.exp(b - max);
  const s = ea + eb;
  if (!Number.isFinite(s) || s === 0) return [0.5, 0.5];
  return [ea / s, eb / s];
}

function estimateCoherence(text: string): number {
  const tokens = basicTokenize(text).map((t) => t.text);
  if (tokens.length === 0) return 0;

  const unique = new Set(tokens).size;
  const uniqueRatio = unique / tokens.length;

  let repeats = 0;
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === tokens[i - 1]) repeats += 1;
  }
  const repetitionPenalty = repeats / tokens.length;

  const lengthScore = clamp01((tokens.length - 3) / 12);

  return clamp01(0.25 + 0.55 * uniqueRatio + 0.35 * lengthScore - 0.5 * repetitionPenalty);
}

export class HEVDistilBertModelLoader {
  private static instance: HEVDistilBertModelLoader | null = null;

  private readonly ortManager = ONNXRuntimeManager.getInstance();

  private session: ortTypes.InferenceSession | null = null;

  private sessionKey: { modelPath: string; vocabPath: string; executionProviders: readonly string[]; maxLength: number } | null = null;

  private vocab: Map<string, number> | null = null;

  private constructor() {
    // singleton
  }

  public static getInstance(): HEVDistilBertModelLoader {
    if (HEVDistilBertModelLoader.instance === null) {
      HEVDistilBertModelLoader.instance = new HEVDistilBertModelLoader();
    }
    return HEVDistilBertModelLoader.instance;
  }

  public static getConfiguredModelPath(): string | null {
    const p = process.env.HEV_DISTILBERT_ONNX_PATH;
    return typeof p === 'string' && p.trim().length > 0 ? p.trim() : null;
  }

  public static getConfiguredVocabPath(): string | null {
    const p = process.env.HEV_DISTILBERT_VOCAB_PATH;
    return typeof p === 'string' && p.trim().length > 0 ? p.trim() : null;
  }

  public async ensureSession(config?: Partial<HEVDistilBertModelConfig>, infer?: HEVDistilBertInferenceConfig): Promise<ortTypes.InferenceSession> {
    const modelPath = config?.modelPath ?? HEVDistilBertModelLoader.getConfiguredModelPath();
    const vocabPath = config?.vocabPath ?? HEVDistilBertModelLoader.getConfiguredVocabPath();

    if (modelPath === null || vocabPath === null) {
      throw new Error('HEV_DISTILBERT_ONNX_PATH/HEV_DISTILBERT_VOCAB_PATH are not configured.');
    }

    await fs.access(modelPath);
    await fs.access(vocabPath);

    await this.ortManager.init();

    const eps = infer?.executionProviders ?? this.ortManager.getPreferredExecutionProviders();
    const maxLength = infer?.maxLength ?? 128;

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

  public async infer(text: string, infer?: HEVDistilBertInferenceConfig): Promise<HEVClassifierResult> {
    const session = await this.ensureSession(undefined, infer);
    if (this.vocab === null || this.sessionKey === null) {
      throw new Error('HEV DistilBERT loader not ready after ensureSession().');
    }

    const maxLength = this.sessionKey.maxLength;
    const { inputIds, attentionMask } = encodeWordpieceBert(text, this.vocab, maxLength);

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
      throw new Error(`HEV DistilBERT session returned no usable output. outputs=${keys.join(', ')}`);
    }

    const data = outTensor.data as Float32Array;

    // Support both 1-logit (sigmoid) and 2-logit (softmax) heads.
    let toxicityScore = 0.5;
    if (data.length >= 2) {
      const [, toxic] = softmax2(data[0] ?? 0, data[1] ?? 0);
      toxicityScore = toxic;
    } else {
      toxicityScore = sigmoid(data[0] ?? 0);
    }

    toxicityScore = clamp01(toxicityScore);

    const coherenceScore = estimateCoherence(text);

    return { toxicityScore, coherenceScore: clamp01(coherenceScore) };
  }
}

export const hevDistilBertModelLoader = HEVDistilBertModelLoader.getInstance();
