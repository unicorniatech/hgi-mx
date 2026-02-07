import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { EmoShard } from '../bips/bips-placeholder';
import { isValidEmoShard } from '../bips/bips-placeholder';

const HANDSHAKE_PROTOCOL = '/hgi-mx/mesh/handshake/1.0.0';
const HANDSHAKE_MAX_BYTES = 8 * 1024;

const HGI_TOPIC_EMOSHARD = '/hgi/emoshard/1.0.0';
const HGI_TOPIC_ETHICS = '/hgi/ethics/1.0.0';
const HGI_TOPIC_ROLES = '/hgi/roles/1.0.0';
const HGI_TOPIC_ULX_METADATA = '/hgi/ulx-metadata/1.0.0';

function getNodeKeyPath(): string {
  const raw = process.env.HGI_NODE_KEY_PATH;
  if (typeof raw === 'string' && raw.trim().length > 0) return path.resolve(raw.trim());
  return path.resolve(process.cwd(), 'node.key');
}

export interface MeshLibp2pStartOptions {
  listenAddrs?: string[];
  bootstrapPeers?: string[];
  enableMdns?: boolean;
}

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

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

  private pubsub: { publish: (topic: string, data: Uint8Array) => Promise<void>; subscribe: (topic: string) => void } | null = null;

  private localNodeId: string | null = null;

  private discoveredPeerIds = new Set<string>();

  private receivedEmoShards: EmoShard[] = [];

  private receivedUlxMetadata: Array<{ packet_id: string; ethical_metadata: unknown; timestamp_ms: number }> = [];

  private constructor() {
    // singleton
  }

  public static getInstance(): MeshLibp2pAdapter {
    if (MeshLibp2pAdapter.instance === null) {
      MeshLibp2pAdapter.instance = new MeshLibp2pAdapter();
    }
    return MeshLibp2pAdapter.instance;
  }

  public async start(options?: MeshLibp2pStartOptions): Promise<unknown> {
    if (this.node !== null) return this.node;

    if (hasEnv('MESH_LIBP2P_SMOKE')) {
      const stubNode = {
        async start(): Promise<void> {
          // offline stub
        },
        async stop(): Promise<void> {
          // offline stub
        },
        addEventListener(_name: string, _cb: (evt: Event) => void): void {
          // offline stub
        },
        handle(
          _protocol: string,
          _handler: (evt: {
            stream: {
              source: AsyncIterable<Uint8Array>;
              sink: (source: Iterable<Uint8Array> | AsyncIterable<Uint8Array>) => Promise<void>;
            };
          }) => Promise<void>,
        ): void {
          // offline stub
        },
      };

      this.node = stubNode;
      this.pubsub = null;
      this.discoveredPeerIds = new Set<string>();
      this.receivedEmoShards = [];
      this.receivedUlxMetadata = [];
      return stubNode;
    }

    const { createLibp2p } = (await import('libp2p')) as unknown as {
      createLibp2p: (init: unknown) => Promise<unknown>;
    };

    const { tcp } = (await import('@libp2p/tcp')) as unknown as { tcp: () => unknown };
    const { mplex } = (await import('@libp2p/mplex')) as unknown as { mplex: () => unknown };
    const { noise } = (await import('@libp2p/noise')) as unknown as { noise: () => unknown };
    const { mdns } = (await import('@libp2p/mdns')) as unknown as { mdns: (opts: unknown) => unknown };

    const { bootstrap } = (await import('@libp2p/bootstrap')) as unknown as { bootstrap: (opts: unknown) => unknown };
    const { gossipsub } = (await import('@chainsafe/libp2p-gossipsub')) as unknown as {
      gossipsub: (opts?: unknown) => unknown;
    };
    const { multiaddr } = (await import('@multiformats/multiaddr')) as unknown as { multiaddr: (addr: string) => unknown };
    const { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } = (await import('@libp2p/crypto/keys')) as unknown as {
      generateKeyPair: (type: string) => Promise<unknown>;
      privateKeyFromProtobuf: (bytes: Uint8Array) => unknown;
      privateKeyToProtobuf: (key: unknown) => Uint8Array;
    };

    const ensurePrivateKey = async (): Promise<unknown> => {
      const nodeKeyPath = getNodeKeyPath();
      try {
        const bytes = await fs.readFile(nodeKeyPath);
        try {
          return privateKeyFromProtobuf(bytes);
        } catch {
          const pk = await generateKeyPair('Ed25519');
          const next = privateKeyToProtobuf(pk);
          await fs.writeFile(nodeKeyPath, next);
          console.warn('mesh-libp2p: node.key corrupt/unreadable; regenerated key');
          return pk;
        }
      } catch {
        const pk = await generateKeyPair('Ed25519');
        const bytes = privateKeyToProtobuf(pk);
        await fs.writeFile(nodeKeyPath, bytes);
        return pk;
      }
    };

    const parseBootstrapMultiaddrs = (): string[] => {
      const raw = process.env.HGI_BOOTSTRAP_NODES;
      if (typeof raw !== 'string') return [];
      const parts = raw
        .split(/[\s,]+/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return parts;
    };

    const normalizeAddrs = (addrs: readonly string[]): string[] => {
      return addrs.map((s) => s.trim()).filter((s) => s.length > 0);
    };

    const enableMdns = options?.enableMdns !== undefined ? options.enableMdns : true;
    const listenAddrs = normalizeAddrs(options?.listenAddrs ?? []);
    const bootstrapFromEnv = parseBootstrapMultiaddrs();
    const bootstrapFromOptions = normalizeAddrs(options?.bootstrapPeers ?? []);
    const bootstrapAddrs = [...new Set([...bootstrapFromEnv, ...bootstrapFromOptions])];
    const privateKey = await ensurePrivateKey();

    const node = await createLibp2p({
      privateKey,
      ...(listenAddrs.length > 0 ? { addresses: { listen: listenAddrs } } : {}),
      transports: [tcp()],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: [
        ...(enableMdns
          ? [
              mdns({
                interval: 10_000,
              }),
            ]
          : []),
        ...(bootstrapAddrs.length > 0 ? [bootstrap({ list: bootstrapAddrs })] : []),
      ],
      services: {
        pubsub: gossipsub({
          emitSelf: false,
        }),
      },
    });

    const pubsub = (node as { services?: { pubsub?: unknown } }).services?.pubsub;
    if (pubsub !== undefined && pubsub !== null) {
      this.pubsub = pubsub as { publish: (topic: string, data: Uint8Array) => Promise<void>; subscribe: (topic: string) => void };
      this.pubsub.subscribe(HGI_TOPIC_EMOSHARD);
      this.pubsub.subscribe(HGI_TOPIC_ETHICS);
      this.pubsub.subscribe(HGI_TOPIC_ROLES);
      this.pubsub.subscribe(HGI_TOPIC_ULX_METADATA);

      (pubsub as unknown as { addEventListener?: (name: string, cb: (evt: Event) => void) => void })
        .addEventListener?.('message', (evt: Event) => {
          const e = evt as CustomEvent<{ topic: string; data: Uint8Array | Buffer }>;
          try {
            const topic = e.detail.topic;
            if (topic !== HGI_TOPIC_EMOSHARD && topic !== HGI_TOPIC_ULX_METADATA) return;

            const bytes = e.detail.data;
            const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            const msg = decodeJson(u8);

            if (topic === HGI_TOPIC_EMOSHARD) {
              if (!isValidEmoShard(msg)) return;

              this.receivedEmoShards.push(msg);
              if (this.receivedEmoShards.length > 256) {
                this.receivedEmoShards.splice(0, this.receivedEmoShards.length - 256);
              }
              return;
            }

            if (topic === HGI_TOPIC_ULX_METADATA) {
              if (typeof msg !== 'object' || msg === null) return;
              const rec = msg as Record<string, unknown>;
              if (typeof rec.packet_id !== 'string') return;
              const ethical_metadata = rec.ethical_metadata;
              const timestamp_ms = typeof rec.timestamp_ms === 'number' && Number.isFinite(rec.timestamp_ms) ? rec.timestamp_ms : Date.now();

              this.receivedUlxMetadata.push({ packet_id: rec.packet_id, ethical_metadata, timestamp_ms });
              if (this.receivedUlxMetadata.length > 256) {
                this.receivedUlxMetadata.splice(0, this.receivedUlxMetadata.length - 256);
              }
              return;
            }
          } catch {
            // ignore
          }
        });
    }

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

    if (bootstrapAddrs.length > 0) {
      for (const addr of bootstrapAddrs) {
        try {
          await (node as { dial: (ma: unknown) => Promise<void> }).dial(multiaddr(addr));
        } catch {
          // ignore
        }
      }
    }

    this.node = node;
    return node;
  }

  public async stop(): Promise<void> {
    if (this.node === null) return;
    await (this.node as { stop: () => Promise<void> }).stop();
    this.node = null;
    this.pubsub = null;
    this.localNodeId = null;
    this.discoveredPeerIds = new Set<string>();
    this.receivedEmoShards = [];
    this.receivedUlxMetadata = [];
  }

  public async registerLocalNode(nodeId: string, options?: MeshLibp2pStartOptions): Promise<void> {
    this.localNodeId = nodeId;
    await this.start(options);
  }

  public getDiscoveredPeerCount(): number {
    return this.discoveredPeerIds.size;
  }

  public getDiscoveredPeerIds(): readonly string[] {
    return [...this.discoveredPeerIds];
  }

  public getReceivedEmoShards(): readonly EmoShard[] {
    return this.receivedEmoShards.slice();
  }

  public clearReceivedEmoShards(): void {
    this.receivedEmoShards = [];
  }

  public getReceivedUlxMetadata(): ReadonlyArray<{ packet_id: string; ethical_metadata: unknown; timestamp_ms: number }> {
    return this.receivedUlxMetadata.slice();
  }

  public clearReceivedUlxMetadata(): void {
    this.receivedUlxMetadata = [];
  }

  public recordUlxMetadata(packet_id: string, ethical_metadata: unknown, timestamp_ms: number): void {
    this.receivedUlxMetadata.push({ packet_id, ethical_metadata, timestamp_ms });
    if (this.receivedUlxMetadata.length > 256) {
      this.receivedUlxMetadata.splice(0, this.receivedUlxMetadata.length - 256);
    }
  }

  public getLocalPeerId(): string | null {
    if (this.node === null) return null;
    const pid = (this.node as { peerId?: { toString(): string } }).peerId;
    return pid ? pid.toString() : null;
  }

  public getListenMultiaddrs(): readonly string[] {
    if (this.node === null) return [];
    const fn = (this.node as { getMultiaddrs?: () => Array<{ toString(): string }> }).getMultiaddrs;
    if (typeof fn !== 'function') return [];
    try {
      return fn.call(this.node).map((ma) => ma.toString());
    } catch {
      return [];
    }
  }

  public async handshakeWithPeer(peerId: string): Promise<boolean> {
    if (hasEnv('MESH_LIBP2P_SMOKE')) {
      void peerId;
      return false;
    }

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

  public async publishEmoShard(topic: string, shard: EmoShard): Promise<boolean> {
    if (hasEnv('MESH_LIBP2P_SMOKE')) {
      void topic;
      void shard;
      return true;
    }

    if (!isValidEmoShard(shard)) {
      throw new Error('publishEmoShard: invalid EmoShard');
    }

    await this.start();
    if (this.pubsub === null) {
      throw new Error('publishEmoShard: pubsub unavailable');
    }

    try {
      await this.pubsub.publish(topic, encodeJson(shard));
      return true;
    } catch {
      return false;
    }
  }

  public async publishJson(topic: string, value: unknown): Promise<boolean> {
    if (hasEnv('MESH_LIBP2P_SMOKE')) {
      void topic;
      void value;
      return true;
    }

    await this.start();
    if (this.pubsub === null) {
      throw new Error('publishJson: pubsub unavailable');
    }

    try {
      await this.pubsub.publish(topic, encodeJson(value));
      return true;
    } catch {
      return false;
    }
  }
}

export const meshLibp2pAdapter = MeshLibp2pAdapter.getInstance();
