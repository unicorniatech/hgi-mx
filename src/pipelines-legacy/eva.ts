// DEPRECATED: legacy EVA pipeline implementation.
// Use the canonical module implementation at /modules/pipelines/eva.ts instead.

import fs from 'node:fs/promises';
import path from 'node:path';

import type * as ortTypes from 'onnxruntime-node';

import { decodeWav } from '../audio/wav-reader.js';
import { onnxRuntimeManager } from '../../modules/runtime/onnx-config.js';

export type EvaResult = {
  modelPath: string;
  input: {
    sampleRate: number;
    samples: number;
  };
  output: {
    outputName: string;
    dims: readonly number[];
    pooled: number[];
  };
};

function meanPool3D(t: ortTypes.Tensor): number[] {
  const dims = t.dims;
  if (dims.length < 2) {
    const arr = Array.from(t.data as Float32Array);
    return arr;
  }

  const data = t.data as Float32Array;
  const lastDim = dims[dims.length - 1] ?? 1;
  const nVecs = Math.floor(data.length / lastDim);

  const out = new Float32Array(lastDim);
  for (let v = 0; v < nVecs; v += 1) {
    const base = v * lastDim;
    for (let j = 0; j < lastDim; j += 1) {
      out[j] += data[base + j] ?? 0;
    }
  }
  for (let j = 0; j < lastDim; j += 1) {
    out[j] /= Math.max(1, nVecs);
  }
  return Array.from(out);
}

async function getSession(): Promise<ortTypes.InferenceSession> {
  const modelPath = path.resolve(process.cwd(), 'models', 'eva', 'model.onnx');
  await fs.access(modelPath);
  return onnxRuntimeManager.getSession(modelPath);
}

export async function evaFromWavBuffer(wavBytes: Buffer): Promise<EvaResult> {
  const pcm = decodeWav(wavBytes, 16_000);

  const session = await getSession();
  const ort = await import('onnxruntime-node');

  const inputName = session.inputNames[0] ?? 'input_values';
  const waveform = pcm.pcm;

  const feeds: Record<string, ortTypes.Tensor> = {
    [inputName]: new ort.Tensor('float32', waveform, [1, waveform.length]),
  };

  const results = await session.run(feeds);

  const outputName =
    session.outputNames.find((n) => /last_hidden_state/i.test(n)) ??
    session.outputNames.find((n) => /embeddings/i.test(n)) ??
    session.outputNames[0] ??
    Object.keys(results)[0] ??
    'output';

  const outTensor = results[outputName];
  if (!outTensor) {
    throw new Error(`EVA returned no output tensor for name=${outputName}`);
  }

  const pooled = meanPool3D(outTensor);

  return {
    modelPath: path.resolve(process.cwd(), 'models', 'eva', 'model.onnx'),
    input: { sampleRate: pcm.sampleRate, samples: waveform.length },
    output: { outputName, dims: outTensor.dims, pooled },
  };
}
