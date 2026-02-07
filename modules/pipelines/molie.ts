import fs from 'node:fs/promises';
import path from 'node:path';

import type * as ortTypes from 'onnxruntime-node';

import { onnxRuntimeManager } from '../runtime/onnx-config';
import { MinimalBertTokenizer } from '../tokenizers/bert-tokenizer';

export type MolieResult = {
  modelPath: string;
  input: {
    text: string;
    maxLength: number;
    tokens: string[];
  };
  output: {
    outputName: string;
    dims: readonly number[];
    data: number[];
  };
};

async function getSession(): Promise<ortTypes.InferenceSession> {
  const modelPath = path.resolve(process.cwd(), 'models', 'molie', 'model.onnx');
  await fs.access(modelPath);
  return onnxRuntimeManager.getSession(modelPath);
}

export async function molieFromText(text: string, maxLength = 128): Promise<MolieResult> {
  const session = await getSession();
  const ort = await import('onnxruntime-node');

  const tokenizer = new MinimalBertTokenizer({ maxLength });
  const enc = tokenizer.encode(text, maxLength);

  const inputIdsName = session.inputNames.find((n) => /input_ids/i.test(n)) ?? session.inputNames[0] ?? 'input_ids';
  const maskName =
    session.inputNames.find((n) => /attention_mask/i.test(n)) ?? session.inputNames[1] ?? 'attention_mask';

  const feeds: Record<string, ortTypes.Tensor> = {
    [inputIdsName]: new ort.Tensor('int64', enc.inputIds, [1, maxLength]),
    [maskName]: new ort.Tensor('int64', enc.attentionMask, [1, maxLength]),
  };

  const results = await session.run(feeds);

  const outputName = session.outputNames[0] ?? Object.keys(results)[0] ?? 'output';
  const outTensor = results[outputName];
  if (!outTensor) {
    throw new Error(`MOLIE returned no output tensor for name=${outputName}`);
  }

  const data = Array.from(outTensor.data as Float32Array);

  return {
    modelPath: path.resolve(process.cwd(), 'models', 'molie', 'model.onnx'),
    input: { text, maxLength, tokens: enc.tokens },
    output: { outputName, dims: outTensor.dims, data },
  };
}
