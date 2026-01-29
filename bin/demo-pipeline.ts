import type { EVAInput } from '../modules/eva/eva-placeholder';
import { run_pipeline_scaffold } from '../modules/pipeline';

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function requireEnv(names: string[]): string[] {
  return names.filter((n) => !hasEnv(n));
}

async function main(): Promise<void> {
  const dummyInput: EVAInput = {
    timestamp: Date.now(),
    duration_ms: 5000,
    sample_rate: 16000,
  };

  const wantReal = process.env.HGI_DEMO_REAL === '1';
  if (wantReal) {
    const missing = requireEnv([
      'EVA_WAV2VEC2_ONNX_PATH',
      'ESS_MLP_ONNX_PATH',
      'HEV_DISTILBERT_ONNX_PATH',
      'HEV_DISTILBERT_VOCAB_PATH',
      'MOLIE_PHI3_ONNX_PATH',
      'MOLIE_PHI3_VOCAB_PATH',
    ]);

    if (missing.length > 0) {
      console.warn('[demo] HGI_DEMO_REAL=1 but missing env vars. Will run in degraded mode. Missing:');
      for (const m of missing) console.warn(`  - ${m}`);
      process.env.HGI_FORCE_DEGRADED = '1';
    }
  }

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

  const t0 = Date.now();
  try {
    const result = await run_pipeline_scaffold(dummyInput);
    const elapsed = Date.now() - t0;

    const isDegraded = warns.some((w) => String(w[0]).includes('degraded'));

    console.log('---');
    console.log(`[demo] pipeline total latency: ${elapsed}ms`);
    console.log(`[demo] degraded mode: ${isDegraded ? 'yes' : 'no'}`);
    console.log(`[demo] HEV ethical_color: ${String(result.hevScore.ethical_color)}`);
    console.log(`[demo] BIPS similarity_score: ${result.bipsEnvelope.similarity_score}`);

    console.log('---');
    console.log(JSON.stringify(result, null, 2));

    void infos;
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

main().catch((err) => {
  console.error('[demo] failed:', err);
  process.exitCode = 1;
});
