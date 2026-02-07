import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

class MockAudioBufferSourceNode {
  public buffer: AudioBuffer | null = null;

  public onended: (() => void) | null = null;

  public connect(): void {}

  public start(): void {
    // keep playing=true until test/user ends playback
  }
}

class MockAudioContext {
  public destination: unknown = {};

  public createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    return {
      length,
      duration: length / sampleRate,
      sampleRate,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(length),
    } as unknown as AudioBuffer;
  }

  public createBufferSource(): MockAudioBufferSourceNode {
    return new MockAudioBufferSourceNode();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext as any);
vi.stubGlobal('webkitAudioContext', MockAudioContext as any);
