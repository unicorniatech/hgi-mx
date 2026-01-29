import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { onnx } from 'onnx-proto';

import { ONNXRuntimeManager } from '../modules/runtime/onnx-config';

function makeIdentityModelBytes(): Uint8Array {
  const tensorFloat = onnx.TensorProto.DataType.FLOAT;

  const model = onnx.ModelProto.create({
    irVersion: 8,
    opsetImport: [
      onnx.OperatorSetIdProto.create({
        domain: '',
        version: 13,
      }),
    ],
    graph: onnx.GraphProto.create({
      name: 'identity_graph',
      input: [
        onnx.ValueInfoProto.create({
          name: 'X',
          type: onnx.TypeProto.create({
            tensorType: onnx.TypeProto.Tensor.create({
              elemType: tensorFloat,
              shape: onnx.TensorShapeProto.create({
                dim: [onnx.TensorShapeProto.Dimension.create({ dimValue: 1 })],
              }),
            }),
          }),
        }),
      ],
      output: [
        onnx.ValueInfoProto.create({
          name: 'Y',
          type: onnx.TypeProto.create({
            tensorType: onnx.TypeProto.Tensor.create({
              elemType: tensorFloat,
              shape: onnx.TensorShapeProto.create({
                dim: [onnx.TensorShapeProto.Dimension.create({ dimValue: 1 })],
              }),
            }),
          }),
        }),
      ],
      node: [
        onnx.NodeProto.create({
          opType: 'Identity',
          input: ['X'],
          output: ['Y'],
        }),
      ],
    }),
  });

  return onnx.ModelProto.encode(model).finish();
}

async function writeTempOnnxFile(bytes: Uint8Array): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-onnx-'));
  const modelPath = path.join(dir, 'identity.onnx');
  await fs.writeFile(modelPath, bytes);
  return modelPath;
}

test('onnx runtime smoke: init + create session with CUDA fallback to CPU', async () => {
  const manager = ONNXRuntimeManager.getInstance();

  const infos: Array<unknown[]> = [];
  const warns: Array<unknown[]> = [];

  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.info = (...args: unknown[]) => {
    infos.push(args);
    originalInfo(...args);
  };

  console.warn = (...args: unknown[]) => {
    warns.push(args);
    originalWarn(...args);
  };

  try {
    await manager.init();
    const caps = manager.getCapabilities();

    assert.ok(Array.isArray(caps.providers));
    assert.ok(caps.providers.length > 0);

    const modelPath = await writeTempOnnxFile(makeIdentityModelBytes());

    const session = await manager.getSession(modelPath, ['cuda', 'cpu']);
    assert.ok(session);

    if (caps.cudaAvailable) {
      assert.equal(warns.length, 0);
    } else {
      assert.ok(warns.some((w) => String(w[0]).includes('[onnx] CUDA requested but unavailable.')));
    }

    assert.ok(infos.some((i) => String(i[0]).includes('[onnx] providers:')));
    assert.ok(infos.some((i) => String(i[0]).includes('[onnx] cuda provider registered:')));
    assert.ok(infos.some((i) => String(i[0]).includes('[onnx] cuda available:')));
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
});
