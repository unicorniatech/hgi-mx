const HANDSHAKE_PROTOCOL = '/hgi-mx/mesh/handshake/1.0.0';
const HANDSHAKE_MAX_BYTES = 8 * 1024;

export interface MeshHandshakePayload {
  node_id: string;
  timestamp: number;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeJson(bytes: Uint8Array): unknown {
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

async function readAll(source: AsyncIterable<Uint8Array>, maxBytes?: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const c of source) {
    chunks.push(c);
    total += c.length;

    if (typeof maxBytes === 'number' && total > maxBytes) {
      throw new Error('message_too_large');
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }

  return out;
}

export class MeshLibp2pAdapter {
  private static instance: MeshLibp2pAdapter | null = null;

  private node: unknown | null = null;

  private localNodeId: string | null = null;

  private discoveredPeerIds = new Set<string>();

  private constructor() {
    // singleton
  }

  public static getInstance(): MeshLibp2pAdapter {
    if (MeshLibp2pAdapter.instance === null) {
      MeshLibp2pAdapter.instance = new MeshLibp2pAdapter();
    }
    return MeshLibp2pAdapter.instance;
  }

  public async start(): Promise<unknown> {
    if (this.node !== null) return this.node;

    const { createLibp2p } = (await import('libp2p')) as unknown as {
      createLibp2p: (init: unknown) => Promise<unknown>;
    };

    const { tcp } = (await import('@libp2p/tcp')) as unknown as { tcp: () => unknown };
    const { mplex } = (await import('@libp2p/mplex')) as unknown as { mplex: () => unknown };
    const { noise } = (await import('@libp2p/noise')) as unknown as { noise: () => unknown };
    const { mdns } = (await import('@libp2p/mdns')) as unknown as { mdns: (opts: unknown) => unknown };

    const node = await createLibp2p({
      transports: [tcp()],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: [
        mdns({
          interval: 10_000,
        }),
      ],
    });

    (node as { addEventListener: (name: string, cb: (evt: Event) => void) => void }).addEventListener('peer:discovery', (evt: Event) => {
      const e = evt as CustomEvent<{ id: { toString(): string } }>;
      try {
        const pid = e.detail.id.toString();
        this.discoveredPeerIds.add(pid);
      } catch {
        // ignore
      }
    });

    (node as {
      handle: (
        protocol: string,
        handler: (evt: {
          stream: {
            source: AsyncIterable<Uint8Array>;
            sink: (source: Iterable<Uint8Array> | AsyncIterable<Uint8Array>) => Promise<void>;
          };
        }) => Promise<void>,
      ) => void;
    }).handle(
      HANDSHAKE_PROTOCOL,
      async (evt: {
        stream: {
          source: AsyncIterable<Uint8Array>;
          sink: (source: Iterable<Uint8Array> | AsyncIterable<Uint8Array>) => Promise<void>;
        };
      }) => {
        let response: { ok: boolean; error?: string; node_id?: string; timestamp?: number } = {
          ok: false,
          error: 'invalid_payload',
        };

        try {
          const bytes = await readAll(evt.stream.source, HANDSHAKE_MAX_BYTES);
          const payload = decodeJson(bytes);

          const ok =
            typeof payload === 'object' &&
            payload !== null &&
            typeof (payload as MeshHandshakePayload).node_id === 'string' &&
            typeof (payload as MeshHandshakePayload).timestamp === 'number';

          response = ok
            ? { ok: true, node_id: this.localNodeId ?? '', timestamp: Date.now() }
            : { ok: false, error: 'invalid_payload' };
        } catch {
          response = { ok: false, error: 'invalid_payload' };
        }

        try {
          await evt.stream.sink([encodeJson(response)]);
        } catch {
          // Never throw from handler.
        }
      },
    );

    await (node as { start: () => Promise<void> }).start();

    this.node = node;
    return node;
  }

  public async stop(): Promise<void> {
    if (this.node === null) return;
    await (this.node as { stop: () => Promise<void> }).stop();
    this.node = null;
    this.localNodeId = null;
    this.discoveredPeerIds = new Set<string>();
  }

  public async registerLocalNode(nodeId: string): Promise<void> {
    this.localNodeId = nodeId;
    await this.start();
  }

  public getDiscoveredPeerCount(): number {
    return this.discoveredPeerIds.size;
  }

  public getDiscoveredPeerIds(): readonly string[] {
    return [...this.discoveredPeerIds];
  }

  public async handshakeWithPeer(peerId: string): Promise<boolean> {
    const node = await this.start();

    const payload: MeshHandshakePayload = {
      node_id: this.localNodeId ?? '',
      timestamp: Date.now(),
    };

    try {
      const stream = await (node as {
        dialProtocol: (
          peerId: string,
          protocol: string,
        ) => Promise<{ sink: (src: Iterable<Uint8Array> | AsyncIterable<Uint8Array>) => Promise<void>; source: AsyncIterable<Uint8Array> }>;
      }).dialProtocol(peerId, HANDSHAKE_PROTOCOL);
      await stream.sink([encodeJson(payload)]);
      const bytes = await readAll(stream.source, HANDSHAKE_MAX_BYTES);
      const resp = decodeJson(bytes) as { ok?: unknown };
      return resp?.ok === true;
    } catch {
      return false;
    }
  }
}

export const meshLibp2pAdapter = MeshLibp2pAdapter.getInstance();
