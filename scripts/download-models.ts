import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import fetch from 'node-fetch';
import fse from 'fs-extra';

type DownloadSpec = {
  url: string;
  outPath: string;
  description: string;
};

const ROOT = path.resolve(process.cwd(), 'models');

function log(msg: string): void {
  // Keep logs simple and greppable.
  // eslint-disable-next-line no-console
  console.log(`[setup:models] ${msg}`);
}

async function fileExistsNonEmpty(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

async function sha256File(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function downloadToFile(spec: DownloadSpec): Promise<void> {
  await fse.ensureDir(path.dirname(spec.outPath));

  if (await fileExistsNonEmpty(spec.outPath)) {
    log(`skip (exists): ${spec.description} -> ${path.relative(process.cwd(), spec.outPath)}`);
    return;
  }

  log(`download: ${spec.description}`);
  log(`  from: ${spec.url}`);
  log(`  to:   ${path.relative(process.cwd(), spec.outPath)}`);

  const res = await fetch(spec.url);
  if (!res.ok || res.body === null) {
    throw new Error(`Download failed (${res.status} ${res.statusText}) for ${spec.url}`);
  }

  const total = Number(res.headers.get('content-length') ?? '0');
  let received = 0;
  let lastLoggedPct = -1;

  const hasher = crypto.createHash('sha256');

  const tmpPath = `${spec.outPath}.partial`;
  const outStream = createWriteStream(tmpPath);

  await new Promise<void>((resolve, reject) => {
    const body = res.body as unknown as NodeJS.ReadableStream;

    const onError = (err: unknown): void => {
      try {
        outStream.destroy();
      } catch {
        // ignore
      }
      reject(err);
    };

    outStream.on('error', onError);
    body.on('error', onError);

    body.on('data', (chunk: Buffer) => {
      received += chunk.length;
      hasher.update(chunk);

      if (total > 0) {
        const pct = Math.floor((received / total) * 100);
        if (pct !== lastLoggedPct && pct % 10 === 0) {
          lastLoggedPct = pct;
          log(`  progress: ${pct}%`);
        }
      }
    });

    outStream.on('finish', resolve);
    body.pipe(outStream);
  });

  await fs.rename(tmpPath, spec.outPath);

  const digest = hasher.digest('hex');
  await fs.writeFile(`${spec.outPath}.sha256`, `${digest}  ${path.basename(spec.outPath)}\n`);
  log(`done: ${spec.description} (sha256=${digest.slice(0, 12)}...)`);
}

async function writeJsonIfMissing(outPath: string, value: unknown): Promise<void> {
  await fse.ensureDir(path.dirname(outPath));
  if (await fileExistsNonEmpty(outPath)) return;
  await fs.writeFile(outPath, JSON.stringify(value, null, 2));
}

async function listHfFiles(repoId: string): Promise<string[]> {
  const url = `https://huggingface.co/api/models/${encodeURIComponent(repoId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF API failed (${res.status} ${res.statusText}) for ${url}`);
  }
  const data = (await res.json()) as { siblings?: Array<{ rfilename?: string }> };
  const files = (data.siblings ?? [])
    .map((s) => s.rfilename)
    .filter((x): x is string => typeof x === 'string');
  return files;
}

async function downloadHfResolve(repoId: string, filePath: string, outPath: string, description: string): Promise<void> {
  const url = `https://huggingface.co/${repoId}/resolve/main/${filePath}`;
  await downloadToFile({ url, outPath, description });
}

async function main(): Promise<void> {
  await fse.ensureDir(ROOT);

  const evaDir = path.join(ROOT, 'eva');
  const essDir = path.join(ROOT, 'ess');
  const hevDir = path.join(ROOT, 'hev');
  const molieDir = path.join(ROOT, 'molie');

  await Promise.all([fse.ensureDir(evaDir), fse.ensureDir(essDir), fse.ensureDir(hevDir), fse.ensureDir(molieDir)]);

  // EVA
  await downloadToFile({
    url: 'https://huggingface.co/onnx-community/wav2vec2-base-960h-ONNX/resolve/main/model.onnx',
    outPath: path.join(evaDir, 'model.onnx'),
    description: 'EVA wav2vec2 model.onnx',
  });

  await downloadToFile({
    url: 'https://huggingface.co/onnx-community/wav2vec2-base-960h-ONNX/resolve/main/tokenizer.json',
    outPath: path.join(evaDir, 'tokenizer.json'),
    description: 'EVA wav2vec2 tokenizer.json',
  });

  await downloadToFile({
    url: 'https://huggingface.co/onnx-community/wav2vec2-base-960h-ONNX/resolve/main/config.json',
    outPath: path.join(evaDir, 'config.json'),
    description: 'EVA wav2vec2 config.json',
  });

  // ESS (placeholder model + dummy tokenizer)
  await downloadToFile({
    url: 'https://github.com/onnx/models/raw/main/validated/vision/body_analysis/darknet/pose_estimation_2d/resnet50.onnx',
    outPath: path.join(essDir, 'model.onnx'),
    description: 'ESS sample ONNX model (resnet50.onnx from ONNX zoo)',
  });

  await writeJsonIfMissing(path.join(essDir, 'tokenizer.json'), {
    kind: 'dummy',
    note: 'ESS MLP placeholder tokenizer. Replace with real regressor assets.',
  });

  // HEV
  // Required by request: model.quant.onnx + tokenizer. We attempt common tokenizer filenames when present.
  await downloadToFile({
    url: 'https://huggingface.co/gravitee-io/distilbert-multilingual-toxicity-classifier/resolve/main/model.quant.onnx',
    outPath: path.join(hevDir, 'model.quant.onnx'),
    description: 'HEV distilbert toxicity model.quant.onnx',
  });

  // Best-effort tokenizer assets.
  const hevRepo = 'gravitee-io/distilbert-multilingual-toxicity-classifier';
  const hevFiles = await listHfFiles(hevRepo);
  const hevTokenizerCandidates = ['tokenizer.json', 'vocab.txt', 'config.json'];
  for (const f of hevTokenizerCandidates) {
    if (hevFiles.includes(f)) {
      await downloadHfResolve(hevRepo, f, path.join(hevDir, f), `HEV ${f}`);
    }
  }

  // MOLIE
  // Request: download microsoft/Phi-3-mini-4k-instruct-onnx cuda/cuda-int4-rtn-block-32/* -> models/molie
  const phiRepo = 'microsoft/Phi-3-mini-4k-instruct-onnx';
  const phiFiles = await listHfFiles(phiRepo);
  const prefix = 'cuda/cuda-int4-rtn-block-32/';
  const wanted = phiFiles.filter((f) => f.startsWith(prefix));

  if (wanted.length === 0) {
    log(`warn: no files found under ${phiRepo}:${prefix} (repo layout may have changed)`);
  } else {
    log(`Phi-3 files to download: ${wanted.length}`);
    for (const f of wanted) {
      const rel = f.slice(prefix.length);
      await downloadHfResolve(phiRepo, f, path.join(molieDir, rel), `MOLIE Phi-3 ${rel}`);
    }
  }

  // Helpful output for env wiring.
  log('---');
  log('Suggested env vars:');
  log(`  EVA_WAV2VEC2_ONNX_PATH=${path.join(evaDir, 'model.onnx')}`);
  log(`  ESS_MLP_ONNX_PATH=${path.join(essDir, 'model.onnx')}`);
  log(`  HEV_DISTILBERT_ONNX_PATH=${path.join(hevDir, 'model.quant.onnx')}`);
  if (await fileExistsNonEmpty(path.join(hevDir, 'vocab.txt'))) {
    log(`  HEV_DISTILBERT_VOCAB_PATH=${path.join(hevDir, 'vocab.txt')}`);
  } else if (await fileExistsNonEmpty(path.join(hevDir, 'tokenizer.json'))) {
    log(`  HEV_DISTILBERT_VOCAB_PATH=<not downloaded> (loader expects vocab.txt; tokenizer.json present)`);
  }

  // MOLIE loader expects an ONNX path + vocab path in this repo implementation; Phi-3 layout varies.
  log(`  MOLIE_PHI3_ONNX_PATH=<set to the downloaded .onnx under ${path.relative(process.cwd(), molieDir)}>`);
  log(`  MOLIE_PHI3_VOCAB_PATH=<set to vocab.txt if present>`);

  // Print a quick SHA summary (best-effort).
  const important = [
    path.join(evaDir, 'model.onnx'),
    path.join(essDir, 'model.onnx'),
    path.join(hevDir, 'model.quant.onnx'),
  ];
  for (const p of important) {
    if (await fileExistsNonEmpty(p)) {
      const digest = await sha256File(p);
      log(`sha256 ${path.relative(process.cwd(), p)} = ${digest}`);
    }
  }

  log('setup complete');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[setup:models] failed:', err);
  process.exitCode = 1;
});
