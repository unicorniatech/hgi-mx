import fs from 'node:fs/promises';
import path from 'node:path';

import type * as ortTypes from 'onnxruntime-node';

import { onnxRuntimeManager } from '../runtime/onnx-config';
import { MinimalBertTokenizer } from '../tokenizers/bert-tokenizer';

export type HevResult = {
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
  const modelPath = path.resolve(process.cwd(), 'models', 'hev', 'model.onnx');
  await fs.access(modelPath);
  return onnxRuntimeManager.getSession(modelPath);
}

export async function hevFromText(text: string, maxLength = 128): Promise<HevResult> {
  const session = await getSession();
  const ort = await import('onnxruntime-node');

  const tokenizer = new MinimalBertTokenizer({ maxLength });
  const enc = tokenizer.encode(text, maxLength);

  const inputIdsName = session.inputNames.find((n) => /input_ids/i.test(n)) ?? session.inputNames[0] ?? 'input_ids';

  const inputMaskName = session.inputNames.find((n) => /input_mask/i.test(n)) ?? 'input_mask:0';
  const segmentIdsName = session.inputNames.find((n) => /segment_ids/i.test(n)) ?? 'segment_ids:0';

  const dim1For = (name: string): number | undefined => {
    const metaAny = session.inputMetadata as unknown;
    const meta = Array.isArray(metaAny)
      ? (metaAny[session.inputNames.indexOf(name)] as { dimensions?: readonly unknown[] } | undefined)
      : ((metaAny as Record<string, { dimensions?: readonly unknown[] }>)[name] as { dimensions?: readonly unknown[] } | undefined);

    const dims = meta?.dimensions;
    if (!dims) return undefined;

    const parsedDims = Array.from(dims)
      .map((d) => {
        if (typeof d === 'number') return d;
        if (typeof d === 'bigint') return Number(d);
        if (typeof d === 'string') {
          const parsed = Number(d);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
      })
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d > 1);

    if (parsedDims.length === 0) return undefined;
    return Math.max(...parsedDims);
  };

  const seqLenRaw = dim1For(segmentIdsName) ?? dim1For(inputMaskName) ?? dim1For(inputIdsName) ?? maxLength;
  const seqLen = segmentIdsName === 'segment_ids:0' ? Math.max(seqLenRaw, 256) : seqLenRaw;

  const padBigInt64 = (src: BigInt64Array, len: number): BigInt64Array => {
    if (src.length === len) return src;
    const out = new BigInt64Array(len);
    out.set(src.subarray(0, Math.min(src.length, len)));
    return out;
  };

  const inputIds = padBigInt64(enc.inputIds, seqLen);
  const inputMask = padBigInt64(enc.attentionMask, seqLen);
  const segmentIds = new BigInt64Array(seqLen);

  const feeds: Record<string, ortTypes.Tensor> = {
    [inputIdsName]: new ort.Tensor('int64', inputIds, [1, seqLen]),
    [inputMaskName]: new ort.Tensor('int64', inputMask, [1, seqLen]),
    [segmentIdsName]: new ort.Tensor('int64', segmentIds, [1, seqLen]),
  };

  feeds['unique_ids_raw_output___9:0'] = new ort.Tensor('int64', new BigInt64Array([0n]), [1]);

  const results = await session.run(feeds);

  const outputName = session.outputNames[0] ?? Object.keys(results)[0] ?? 'output';
  const outTensor = results[outputName];
  if (!outTensor) {
    throw new Error(`HEV returned no output tensor for name=${outputName}`);
  }

  const data = Array.from(outTensor.data as Float32Array);

  return {
    modelPath: path.resolve(process.cwd(), 'models', 'hev', 'model.onnx'),
    input: { text, maxLength, tokens: enc.tokens },
    output: { outputName, dims: outTensor.dims, data },
  };
}
