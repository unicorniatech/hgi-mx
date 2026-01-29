import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { EVAInput } from '../modules/eva/eva-placeholder';
import { isValidEVAVector } from '../modules/eva/eva-placeholder';
import { isValidESSIntent } from '../modules/ess/ess-placeholder';
import { isValidHEVScore } from '../modules/hev/hev-placeholder';
import { isValidMOLIEMap } from '../modules/molie/molie-placeholder';
import { isValidIrreversibilityEnvelope } from '../modules/bips/bips-placeholder';
import { isValidMeshNodeInfo } from '../modules/mesh/mesh-placeholder';

import { run_pipeline_scaffold } from '../modules/pipeline';
import { ONNXRuntimeManager } from '../modules/runtime/onnx-config';
import { onnx } from 'onnx-proto';

function findFirstFileRecursiveSync(dir: string, predicate: (filePath: string) => boolean, maxDepth: number): string | null {
  if (maxDepth < 0) return null;
  try {
    const entries = fsSync.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && predicate(full)) return full;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const nested = findFirstFileRecursiveSync(path.join(dir, e.name), predicate, maxDepth - 1);
      if (nested !== null) return nested;
    }
    return null;
  } catch {
    return null;
  }
}

function applyModelBasePathDefaults(): void {
  const base = process.env.MODEL_BASE_PATH ?? './models';

  const eva = path.resolve(base, 'eva', 'model.onnx');
  if (!(typeof process.env.EVA_WAV2VEC2_ONNX_PATH === 'string' && process.env.EVA_WAV2VEC2_ONNX_PATH.trim().length > 0)) {
    if (fsSync.existsSync(eva)) process.env.EVA_WAV2VEC2_ONNX_PATH = eva;
  }

  const ess = path.resolve(base, 'ess', 'model.onnx');
  if (!(typeof process.env.ESS_MLP_ONNX_PATH === 'string' && process.env.ESS_MLP_ONNX_PATH.trim().length > 0)) {
    if (fsSync.existsSync(ess)) process.env.ESS_MLP_ONNX_PATH = ess;
  }

  const hevModel = path.resolve(base, 'hev', 'model.quant.onnx');
  if (!(typeof process.env.HEV_DISTILBERT_ONNX_PATH === 'string' && process.env.HEV_DISTILBERT_ONNX_PATH.trim().length > 0)) {
    if (fsSync.existsSync(hevModel)) process.env.HEV_DISTILBERT_ONNX_PATH = hevModel;
  }

  const hevVocab = path.resolve(base, 'hev', 'vocab.txt');
  if (!(typeof process.env.HEV_DISTILBERT_VOCAB_PATH === 'string' && process.env.HEV_DISTILBERT_VOCAB_PATH.trim().length > 0)) {
    if (fsSync.existsSync(hevVocab)) process.env.HEV_DISTILBERT_VOCAB_PATH = hevVocab;
  }

  const molieBase = path.resolve(base, 'molie');
  if (!(typeof process.env.MOLIE_PHI3_ONNX_PATH === 'string' && process.env.MOLIE_PHI3_ONNX_PATH.trim().length > 0)) {
    const onnxPath = findFirstFileRecursiveSync(
      molieBase,
      (p) => p.toLowerCase().endsWith('.onnx'),
      6,
    );
    if (onnxPath !== null) process.env.MOLIE_PHI3_ONNX_PATH = onnxPath;
  }

  const molieVocab = path.resolve(base, 'molie', 'vocab.txt');
  if (!(typeof process.env.MOLIE_PHI3_VOCAB_PATH === 'string' && process.env.MOLIE_PHI3_VOCAB_PATH.trim().length > 0)) {
    if (fsSync.existsSync(molieVocab)) {
      process.env.MOLIE_PHI3_VOCAB_PATH = molieVocab;
    } else {
      const vocabPath = findFirstFileRecursiveSync(
        molieBase,
        (p) => p.toLowerCase().endsWith('vocab.txt'),
        6,
      );
      if (vocabPath !== null) process.env.MOLIE_PHI3_VOCAB_PATH = vocabPath;
    }
  }
}

applyModelBasePathDefaults();

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function requireAllEnv(names: string[]): boolean {
  return names.every((n) => hasEnv(n));
}

function makeEVAInput(): EVAInput {
  return {
    timestamp: 0,
    duration_ms: 2_000,
    sample_rate: 16_000,
  };
}

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hgi-mx-phase6-'));
  const modelPath = path.join(dir, 'identity.onnx');
  await fs.writeFile(modelPath, bytes);
  return modelPath;
}

test('phase6: pipeline scaffold produces Phase 3-valid outputs (fallback-safe)', async () => {
  const scaffold = await run_pipeline_scaffold(makeEVAInput());

  assert.ok(isValidEVAVector(scaffold.evaVector));
  assert.ok(isValidESSIntent(scaffold.essIntent));
  assert.ok(isValidHEVScore(scaffold.hevScore));
  assert.ok(isValidMOLIEMap(scaffold.molieMap));
  assert.ok(isValidIrreversibilityEnvelope(scaffold.bipsEnvelope));
  assert.ok(isValidMeshNodeInfo(scaffold.meshNode));

  assert.ok(scaffold.bipsEnvelope.similarity_score < 0.15);
});

test(
  'phase6: real-mode post-setup config (MODEL_BASE_PATH) has required model files',
  { skip: !hasEnv('PHASE6_REAL_MODELS') },
  async () => {
    const base = process.env.MODEL_BASE_PATH ?? './models';

    const required = [
      path.resolve(base, 'eva', 'model.onnx'),
      path.resolve(base, 'ess', 'model.onnx'),
      path.resolve(base, 'hev', 'model.quant.onnx'),
      path.resolve(base, 'hev', 'vocab.txt'),
    ];

    for (const p of required) {
      await fs.access(p);
    }

    // MOLIE Phi-3 layout varies; require at least one .onnx file somewhere under models/molie.
    const molieDir = path.resolve(base, 'molie');
    const found = findFirstFileRecursiveSync(molieDir, (p) => p.toLowerCase().endsWith('.onnx'), 6);
    assert.ok(found !== null, 'expected at least one .onnx file under models/molie');
  },
);

test(
  'phase6: post-setup regression - pnpm test passes in real mode (spawned) (opt-in)',
  {
    skip: !(
      hasEnv('PHASE6_REAL_MODELS') &&
      process.env.PHASE6_SPAWN_PNPM_TEST === '1' &&
      process.env.HGI_CHILD_TEST_RUNNER !== '1'
    ),
  },
  async () => {
    // Avoid re-entrant invocation loops: the child sets HGI_CHILD_TEST_RUNNER=1.
    const base = process.env.MODEL_BASE_PATH ?? './models';
    const mustExist = [
      path.resolve(base, 'eva', 'model.onnx'),
      path.resolve(base, 'ess', 'model.onnx'),
      path.resolve(base, 'hev', 'model.quant.onnx'),
      path.resolve(base, 'hev', 'vocab.txt'),
    ];

    for (const p of mustExist) {
      await fs.access(p);
    }

    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      PHASE6_REAL_MODELS: '1',
      HGI_CHILD_TEST_RUNNER: '1',
    };

    const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn('pnpm', ['test'], {
        cwd: process.cwd(),
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let out = '';
      let err = '';

      child.stdout.on('data', (d: unknown) => {
        out += String(d);
      });
      child.stderr.on('data', (d: unknown) => {
        err += String(d);
      });

      child.on('close', (c: number | null) => {
        resolve({ code: c, stdout: out, stderr: err });
      });
    });

    if (code !== 0) {
      // Include output for debugging.
      // eslint-disable-next-line no-console
      console.error('[phase6 spawned pnpm test] stdout:\n', stdout);
      // eslint-disable-next-line no-console
      console.error('[phase6 spawned pnpm test] stderr:\n', stderr);
    }

    assert.equal(code, 0);
  },
);

test(
  'phase6: pipeline with real models (requires model env vars)',
  {
    skip: !(
      hasEnv('PHASE6_REAL_MODELS') &&
      requireAllEnv([
        'EVA_WAV2VEC2_ONNX_PATH',
        'ESS_MLP_ONNX_PATH',
        'HEV_DISTILBERT_ONNX_PATH',
        'HEV_DISTILBERT_VOCAB_PATH',
        'MOLIE_PHI3_ONNX_PATH',
        'MOLIE_PHI3_VOCAB_PATH',
      ])
    ),
  },
  async () => {
    const scaffold = await run_pipeline_scaffold(makeEVAInput());

    assert.ok(isValidEVAVector(scaffold.evaVector));
    assert.ok(isValidESSIntent(scaffold.essIntent));
    assert.ok(isValidHEVScore(scaffold.hevScore));
    assert.ok(isValidMOLIEMap(scaffold.molieMap));
    assert.ok(isValidIrreversibilityEnvelope(scaffold.bipsEnvelope));
    assert.ok(isValidMeshNodeInfo(scaffold.meshNode));

    assert.ok(scaffold.bipsEnvelope.similarity_score < 0.15);
  },
);

test(
  'phase6: latency budget (pipeline < 5s) (opt-in; requires CUDA + models)',
  {
    skip: !(
      hasEnv('PHASE6_LATENCY_TEST') &&
      requireAllEnv([
        'EVA_WAV2VEC2_ONNX_PATH',
        'ESS_MLP_ONNX_PATH',
        'HEV_DISTILBERT_ONNX_PATH',
        'HEV_DISTILBERT_VOCAB_PATH',
        'MOLIE_PHI3_ONNX_PATH',
        'MOLIE_PHI3_VOCAB_PATH',
      ])
    ),
  },
  async () => {
    const manager = ONNXRuntimeManager.getInstance();
    await manager.init();
    assert.ok(manager.isCudaAvailable());

    const t0 = Date.now();
    await run_pipeline_scaffold(makeEVAInput());
    const elapsed = Date.now() - t0;

    assert.ok(elapsed < 5_000, `pipeline latency budget exceeded: ${elapsed}ms`);
  },
);

test(
  'phase6: GPU utilization (opt-in; requires CUDA)',
  { skip: !hasEnv('PHASE6_GPU_TEST') },
  async () => {
    const manager = ONNXRuntimeManager.getInstance();
    await manager.init();

    const caps = manager.getCapabilities();
    assert.ok(Array.isArray(caps.providers));
    assert.ok(caps.providers.length > 0);
    assert.ok(caps.cudaProviderRegistered);
    assert.ok(caps.cudaAvailable);
    assert.deepEqual(manager.getPreferredExecutionProviders(), ['cuda', 'cpu']);

    const modelPath = await writeTempOnnxFile(makeIdentityModelBytes());

    const warns: Array<unknown[]> = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args);
      originalWarn(...args);
    };

    try {
      const session = await manager.getSession(modelPath, ['cuda']);
      assert.ok(session);

      const ort = await import('onnxruntime-node');
      const feeds: Record<string, unknown> = {
        X: new ort.Tensor('float32', Float32Array.from([1]), [1]),
      };
      const out = await session.run(feeds as never);
      assert.ok(out);

      // If we requested CUDA-only and CUDA is available, we should not have emitted CPU fallback warnings.
      assert.ok(!warns.some((w) => String(w[0]).includes('[onnx] CUDA requested but unavailable.')));

      const anyOrt = ort as unknown as { getCudaDeviceName?: () => string };
      if (typeof anyOrt.getCudaDeviceName === 'function') {
        const name = anyOrt.getCudaDeviceName();
        assert.ok(name.toLowerCase().includes('5090'));
      }
    } finally {
      console.warn = originalWarn;
    }
  },
);

test('phase6: degraded mode forced via timeouts uses fallback outputs', async () => {
  const old = process.env.HGI_FORCE_DEGRADED;
  process.env.HGI_FORCE_DEGRADED = '1';

  try {
    const scaffold = await run_pipeline_scaffold(makeEVAInput());

    assert.ok(isValidEVAVector(scaffold.evaVector));
    assert.equal(scaffold.evaVector.pitch_mean, 0.5);

    assert.ok(isValidHEVScore(scaffold.hevScore));
    assert.equal(scaffold.hevScore.degradedMode, true);

    assert.ok(isValidIrreversibilityEnvelope(scaffold.bipsEnvelope));
    assert.ok(scaffold.bipsEnvelope.similarity_score < 0.15);
  } finally {
    process.env.HGI_FORCE_DEGRADED = old;
  }
});

test(
  'phase6: session reuse / no unbounded ONNX session growth (opt-in)',
  {
    skip: !(
      hasEnv('PHASE6_MEMORY_TEST') &&
      requireAllEnv(['EVA_WAV2VEC2_ONNX_PATH', 'ESS_MLP_ONNX_PATH', 'HEV_DISTILBERT_ONNX_PATH', 'HEV_DISTILBERT_VOCAB_PATH'])
    ),
  },
  async () => {
    const manager = ONNXRuntimeManager.getInstance();
    await manager.init();

    const getSessionCount = (): number => {
      const anyManager = manager as unknown as { sessions?: Map<string, unknown> };
      return anyManager.sessions?.size ?? 0;
    };

    const before = getSessionCount();

    for (let i = 0; i < 5; i += 1) {
      await run_pipeline_scaffold(makeEVAInput());
    }

    const after = getSessionCount();

    // Session cache should not grow unbounded across repeated runs with same configured model paths.
    assert.ok(after <= before + 6, `unexpected session cache growth: before=${before}, after=${after}`);
  },
);
