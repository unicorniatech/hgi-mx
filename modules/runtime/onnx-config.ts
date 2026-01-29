import type * as ortTypes from 'onnxruntime-node';

export type ORTModule = typeof import('onnxruntime-node');

export interface ONNXRuntimeCapabilities {
  providers: string[];
  cudaProviderRegistered: boolean;
  cudaAvailable: boolean;
}

export interface ONNXSessionKey {
  modelPath: string;
  executionProviders: readonly string[];
}

function normalizeProviders(providers: string[]): string[] {
  const normalized = providers.map((p) => p.toLowerCase());
  // Ensure stable order for keys/logging
  return Array.from(new Set(normalized)).sort();
}

function makeSessionKey(key: ONNXSessionKey): string {
  return JSON.stringify({ modelPath: key.modelPath, executionProviders: [...key.executionProviders] });
}

async function tryRegisterCudaProvider(): Promise<boolean> {
  try {
    // Side-effect import: registers CUDA EP with onnxruntime-node if available.
    await import('@onnxruntime-node/cuda');
    return true;
  } catch {
    return false;
  }
}

async function getAvailableProviders(ort: ORTModule): Promise<string[]> {
  const fn = (ort as unknown as { getAvailableProviders?: () => string[] | Promise<string[]> }).getAvailableProviders;
  if (typeof fn === 'function') {
    const res = fn();
    return normalizeProviders(await Promise.resolve(res));
  }

  // Fallback: assume CPU available
  return ['cpu'];
}

export class ONNXRuntimeManager {
  private static instance: ONNXRuntimeManager | null = null;

  private ort: ORTModule | null = null;

  private initPromise: Promise<void> | null = null;

  private capabilities: ONNXRuntimeCapabilities | null = null;

  private readonly sessions = new Map<string, ortTypes.InferenceSession>();

  private constructor() {
    // singleton
  }

  public static getInstance(): ONNXRuntimeManager {
    if (ONNXRuntimeManager.instance === null) {
      ONNXRuntimeManager.instance = new ONNXRuntimeManager();
    }
    return ONNXRuntimeManager.instance;
  }

  public async init(): Promise<void> {
    if (this.initPromise !== null) return this.initPromise;

    this.initPromise = (async () => {
      const ort = (await import('onnxruntime-node')) as ORTModule;

      const cudaProviderRegistered = await tryRegisterCudaProvider();
      const providers = await getAvailableProviders(ort);

      const cudaAvailable = providers.includes('cuda');

      this.ort = ort;
      this.capabilities = {
        providers,
        cudaProviderRegistered,
        cudaAvailable,
      };

      // Capability logging
      console.info('[onnx] providers:', providers.join(', '));
      console.info('[onnx] cuda provider registered:', cudaProviderRegistered);
      console.info('[onnx] cuda available:', cudaAvailable);
    })();

    return this.initPromise;
  }

  public getCapabilities(): ONNXRuntimeCapabilities {
    if (this.capabilities === null) {
      throw new Error('ONNXRuntimeManager not initialized. Call init() first.');
    }
    return this.capabilities;
  }

  public isCudaAvailable(): boolean {
    return this.getCapabilities().cudaAvailable;
  }

  public getPreferredExecutionProviders(): readonly string[] {
    const caps = this.getCapabilities();

    if (caps.cudaAvailable) return ['cuda', 'cpu'];
    return ['cpu'];
  }

  public async getSession(modelPath: string, executionProviders?: readonly string[]): Promise<ortTypes.InferenceSession> {
    await this.init();

    if (this.ort === null) {
      throw new Error('ONNX runtime module not available after init().');
    }

    const providers = executionProviders ?? this.getPreferredExecutionProviders();

    // Validate CUDA usage request
    if (providers.map((p) => p.toLowerCase()).includes('cuda') && !this.isCudaAvailable()) {
      console.warn('[onnx] CUDA requested but unavailable. Falling back to CPU.');
    }

    const effectiveProviders = this.isCudaAvailable() ? providers : ['cpu'];

    const cacheKey = makeSessionKey({ modelPath, executionProviders: effectiveProviders });
    const cached = this.sessions.get(cacheKey);
    if (cached !== undefined) return cached;

    const session = await this.ort.InferenceSession.create(modelPath, {
      executionProviders: [...effectiveProviders],
    });

    this.sessions.set(cacheKey, session);
    return session;
  }

  public disposeSession(modelPath: string, executionProviders?: readonly string[]): void {
    if (this.capabilities === null) return;

    const providers = executionProviders ?? this.getPreferredExecutionProviders();
    const effectiveProviders = this.isCudaAvailable() ? providers : ['cpu'];

    const cacheKey = makeSessionKey({ modelPath, executionProviders: effectiveProviders });
    this.sessions.delete(cacheKey);
  }

  public disposeAll(): void {
    this.sessions.clear();
  }
}

export const onnxRuntimeManager = ONNXRuntimeManager.getInstance();
