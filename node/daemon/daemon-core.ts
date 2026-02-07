// TODO: This file will host the node daemon core runtime (placeholder).
// This file exists only to give Traycer and the architect a location to expand.
// Do not implement logic until instructed.
// Always use MCP REF + MCP EXA when writing code.

// Traycer:
// - Reference `/docs/roadmap/roadmap-v1.md` (Sections 2-4) and `/docs/protocols/*`.
// - Keep changes atomic and versionable.

import { createHash, createPublicKey, verify } from 'node:crypto';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import { createServer } from 'node:http';
import { z } from 'zod';
import type { EmoShard } from '../../modules/bips/bips-placeholder';
import { isValidEmoShard } from '../../modules/bips/bips-placeholder';
import { meshLibp2pAdapter } from '../../modules/mesh/mesh-libp2p-adapter';
import { getNodeTypeWeight, isValidNodeType, stringToNodeType } from '../../modules/mesh/mesh-placeholder';
import { EthicalGradient } from '../../modules/hev/hev-placeholder';

export interface DaemonNodeConfig {
  node_id: string;
  listen_addrs: string[];
  bootstrap_peers: string[];
  enable_mdns: boolean;
}

export interface DaemonNodeState {
  started: boolean;
  peers_connected: number;
  timestamp: number;
}

export interface DaemonCore {
  start(config: DaemonNodeConfig): Promise<DaemonNodeState>;
  stop(): Promise<DaemonNodeState>;
  status(): Promise<DaemonNodeState>;
}

export class DaemonError extends Error {
  public readonly code: string;

  public readonly timestamp: Date;

  public constructor(code: string, message: string, timestamp: Date = new Date()) {
    super(message);
    this.name = 'DaemonError';
    this.code = code;
    this.timestamp = timestamp;

    Object.setPrototypeOf(this, DaemonError.prototype);
  }
}

export function createDaemonValidationError(message: string): DaemonError {
  return new DaemonError('VALIDATION_ERROR', message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidDaemonNodeConfig(value: unknown): value is DaemonNodeConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value.node_id === 'string' &&
    Array.isArray(value.listen_addrs) &&
    value.listen_addrs.every((a) => typeof a === 'string') &&
    Array.isArray(value.bootstrap_peers) &&
    value.bootstrap_peers.every((p) => typeof p === 'string') &&
    typeof value.enable_mdns === 'boolean'
  );
}

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function isInsecureMode(): boolean {
  return hasEnv('HGI_DAEMON_INSECURE');
}

let daemonServer: Server | null = null;
let daemonStarted = false;
const ephemeralShards = new Map<string, EmoShard>();
let shutdownHookInstalled = false;

const HGI_TOPIC_ULX_METADATA = '/hgi/ulx-metadata/1.0.0';

const ZEmoShard = z.custom<EmoShard>((v) => isValidEmoShard(v));

const ZULXPacket = z.object({
  packet_id: z.string().min(1),
  ethical_metadata: z
    .object({
      ethical_color: z.string().optional(),
      risk_flags: z.array(z.string()).optional(),
      constraints: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough(),
  states: z.array(z.unknown()),
});

type ULXPacketLike = z.infer<typeof ZULXPacket>;

function ethicalGradientToScalar(gradient: EthicalGradient): number {
  if (gradient === EthicalGradient.GREEN_SAFE) return 1.0;
  if (gradient === EthicalGradient.YELLOW_CAUTION) return 0.7;
  return 0.0;
}

function parseEthicalGradientFromMetadata(ethical_metadata: unknown): EthicalGradient | null {
  if (!isRecord(ethical_metadata)) return null;
  const raw = ethical_metadata.ethical_color;
  if (raw === EthicalGradient.GREEN_SAFE || raw === EthicalGradient.YELLOW_CAUTION || raw === EthicalGradient.RED_HIGH_RISK) {
    return raw;
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === EthicalGradient.GREEN_SAFE) return EthicalGradient.GREEN_SAFE;
    if (s === EthicalGradient.YELLOW_CAUTION) return EthicalGradient.YELLOW_CAUTION;
    if (s === EthicalGradient.RED_HIGH_RISK) return EthicalGradient.RED_HIGH_RISK;
  }
  return null;
}

function parseEthicalGradientFromEmoShard(shard: EmoShard): EthicalGradient | null {
  const raw = (shard.ethical_score as unknown as { ethical_color?: unknown }).ethical_color;
  if (raw === EthicalGradient.GREEN_SAFE || raw === EthicalGradient.YELLOW_CAUTION || raw === EthicalGradient.RED_HIGH_RISK) {
    return raw;
  }
  return null;
}

function getDaemonPort(): number {
  const raw = process.env.HGI_DAEMON_PORT;
  if (typeof raw !== 'string') return 7777;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return 7777;
  return Math.floor(n);
}

function getMaxTimestampSkewMs(): number {
  const raw = process.env.HGI_SHARD_MAX_SKEW_MS;
  if (typeof raw !== 'string') return 5 * 60_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 5 * 60_000;
  return Math.floor(n);
}

function parseAllowedRoles(): Set<string> {
  const raw = process.env.HGI_ALLOWED_ROLES;
  const roles = typeof raw === 'string' ? raw : 'founder,elder,purifier,eva,ghost,community,personal';
  return new Set(
    roles
      .split(/[\s,]+/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

function parseBootstrapPeersFromEnv(): string[] {
  const raw = process.env.HGI_BOOTSTRAP_NODES;
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseListenPortFromEnv(): number {
  const raw = process.env.HGI_LISTEN_PORT;
  if (typeof raw !== 'string') return 9001;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return 9001;
  return Math.floor(n);
}

function parseEnableMdnsFromEnv(): boolean {
  const raw = process.env.HGI_ENABLE_MDNS;
  if (typeof raw !== 'string') return true;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return true;
}

function deterministicNodeId(nodeType: string, listenPort: number): string {
  return createHash('sha256').update(`${nodeType}:${String(listenPort)}`).digest('hex');
}

export function loadDaemonNodeConfigFromEnv(): DaemonNodeConfig {
  const nodeTypeRaw = typeof process.env.HGI_NODE_TYPE === 'string' ? process.env.HGI_NODE_TYPE.trim() : 'elder';
  if (!isValidNodeType(nodeTypeRaw)) {
    throw createDaemonValidationError(`Invalid HGI_NODE_TYPE: ${nodeTypeRaw}`);
  }

  const nodeType = stringToNodeType(nodeTypeRaw);

  const listenPort = parseListenPortFromEnv();
  const listenAddrs = [`/ip4/0.0.0.0/tcp/${listenPort}`];
  const bootstrapPeers = parseBootstrapPeersFromEnv();

  const nodeIdRaw = typeof process.env.HGI_NODE_ID === 'string' ? process.env.HGI_NODE_ID.trim() : '';
  const node_id = nodeIdRaw.length > 0 ? nodeIdRaw : deterministicNodeId(nodeTypeRaw, listenPort);

  const config: DaemonNodeConfig = {
    node_id,
    listen_addrs: listenAddrs,
    bootstrap_peers: bootstrapPeers,
    enable_mdns: parseEnableMdnsFromEnv(),
  };

  if (!isValidDaemonNodeConfig(config)) {
    throw createDaemonValidationError('loadDaemonNodeConfigFromEnv produced invalid DaemonNodeConfig');
  }

  void nodeType;
  return config;
}

function readHeader(req: IncomingMessage, name: string): string | null {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return null;
}

function tryExtractUlxMetadataFromPacket(value: unknown): { packet_id: string; ethical_metadata: unknown } | null {
  const parsed = ZULXPacket.safeParse(value);
  if (!parsed.success) return null;
  return { packet_id: parsed.data.packet_id, ethical_metadata: parsed.data.ethical_metadata };
}

function extractRoleWeight(roleHeader: string | null): number {
  const role = typeof roleHeader === 'string' ? roleHeader.trim() : '';
  if (role.length === 0) return getNodeTypeWeight(stringToNodeType('ghost'));
  if (!isValidNodeType(role)) return getNodeTypeWeight(stringToNodeType('ghost'));
  return getNodeTypeWeight(stringToNodeType(role));
}

async function readBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    total += b.length;
    if (total > maxBytes) {
      throw new DaemonError('PAYLOAD_TOO_LARGE', 'Payload too large');
    }
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value));
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', String(body.length));
  res.end(body);
}

function verifyEd25519Signature(rawBody: Uint8Array, pubKeyHeader: string, sigHeader: string): boolean {
  const signature = Buffer.from(sigHeader, 'base64');

  const key = pubKeyHeader.trim().startsWith('-----BEGIN')
    ? createPublicKey(pubKeyHeader)
    : createPublicKey({ key: Buffer.from(pubKeyHeader, 'base64'), format: 'der', type: 'spki' });

  return verify(null, rawBody, key, signature);
}

function stableShardId(rawBody: Uint8Array): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

function tryExtractEmoShardFromUlxPacket(value: unknown): EmoShard | null {
  if (!isRecord(value)) return null;
  const states = (value as Record<string, unknown>).states;
  if (!Array.isArray(states)) return null;

  for (const frame of states) {
    if (!isRecord(frame)) continue;
    if (frame.layer !== 'C5') continue;
    const payload = (frame as Record<string, unknown>).payload;
    if (!isRecord(payload)) continue;
    const shard = (payload as Record<string, unknown>).shard;
    if (!isValidEmoShard(shard)) continue;
    return shard as EmoShard;
  }

  return null;
}

export const daemonCore: DaemonCore = {
  async start(config: DaemonNodeConfig): Promise<DaemonNodeState> {
    if (!isValidDaemonNodeConfig(config)) {
      throw createDaemonValidationError('Invalid DaemonNodeConfig input for daemonCore.start');
    }

    if (daemonStarted) {
      return {
        started: true,
        peers_connected: meshLibp2pAdapter.getDiscoveredPeerCount(),
        timestamp: Date.now(),
      };
    }

    await meshLibp2pAdapter.registerLocalNode(config.node_id, {
      listenAddrs: config.listen_addrs,
      bootstrapPeers: config.bootstrap_peers,
      enableMdns: config.enable_mdns,
    });

    const port = getDaemonPort();
    const allowedRoles = parseAllowedRoles();
    const maxSkewMs = getMaxTimestampSkewMs();

    const server = createServer(async (req, res) => {
      try {
        if (req.method === 'GET' && req.url === '/status') {
          const st = await this.status();
          json(res, 200, { ok: true, status: st });
          return;
        }

        if (req.method === 'GET' && req.url === '/peers') {
          const peers = meshLibp2pAdapter.getDiscoveredPeerIds();
          json(res, 200, { ok: true, count: peers.length, peers });
          return;
        }

        if (req.method === 'GET' && req.url === '/self') {
          const peer_id = meshLibp2pAdapter.getLocalPeerId();
          const listen_multiaddrs = meshLibp2pAdapter.getListenMultiaddrs();
          json(res, 200, { ok: true, peer_id, listen_multiaddrs });
          return;
        }

        if (req.method === 'GET' && req.url === '/shards') {
          const ids = Array.from(ephemeralShards.keys());
          json(res, 200, { ok: true, count: ids.length, ids });
          return;
        }

        if (req.method === 'GET' && req.url === '/received') {
          const shards = meshLibp2pAdapter.getReceivedEmoShards();
          json(res, 200, { ok: true, count: shards.length });
          return;
        }

        if (req.method === 'GET' && req.url === '/ulx-received') {
          const items = meshLibp2pAdapter.getReceivedUlxMetadata();
          json(res, 200, { ok: true, count: items.length, items });
          return;
        }

        if (req.method === 'POST' && req.url === '/shard') {
          const insecure = isInsecureMode();
          const role = readHeader(req, 'x-hgi-role');
          if (!insecure) {
            if (role === null || !allowedRoles.has(role)) {
              throw new DaemonError('ROLE_INVALID', 'Invalid or missing role');
            }
          }

          const pubKeyHeader = readHeader(req, 'x-hgi-pubkey');
          const sigHeader = readHeader(req, 'x-hgi-signature');
          if (!insecure) {
            if (pubKeyHeader === null || sigHeader === null) {
              throw new DaemonError('SIGNATURE_MISSING', 'Missing signature headers');
            }
          }

          const rawBody = await readBody(req);
          let shardUnknown: unknown;
          try {
            shardUnknown = JSON.parse(Buffer.from(rawBody).toString('utf8'));
          } catch {
            throw new DaemonError('BAD_JSON', 'Invalid JSON');
          }

          const ulxMeta = tryExtractUlxMetadataFromPacket(shardUnknown);

          let shard: EmoShard | null = null;
          let packet_id: string | null = null;
          let ethical_metadata: unknown = null;

          const shardParse = ZEmoShard.safeParse(shardUnknown);
          if (shardParse.success) {
            shard = shardParse.data;
          } else {
            shard = tryExtractEmoShardFromUlxPacket(shardUnknown);
            packet_id = ulxMeta?.packet_id ?? null;
            ethical_metadata = ulxMeta?.ethical_metadata ?? null;
          }

          if (shard === null) {
            throw new DaemonError('SHARD_INVALID', 'Invalid EmoShard');
          }

          const resolvedPacketId = packet_id ?? stableShardId(rawBody);

          const now = Date.now();
          if (Math.abs(now - shard.timestamp) > maxSkewMs) {
            throw new DaemonError('TIMESTAMP_INVALID', 'Shard timestamp outside allowed window');
          }

          if (!insecure) {
            let sigOk = false;
            try {
              sigOk = verifyEd25519Signature(rawBody, pubKeyHeader ?? '', sigHeader ?? '');
            } catch {
              sigOk = false;
            }

            if (!sigOk) {
              throw new DaemonError('SIGNATURE_INVALID', 'Invalid signature');
            }
          }

          const roleWeight = extractRoleWeight(role);

          const gradientFromUlx = ethical_metadata !== null ? parseEthicalGradientFromMetadata(ethical_metadata) : null;
          const gradientFromShard = parseEthicalGradientFromEmoShard(shard);
          const gradient = gradientFromUlx ?? gradientFromShard ?? EthicalGradient.RED_HIGH_RISK;
          const gateScore = roleWeight * ethicalGradientToScalar(gradient);

          const shouldStore = gateScore > 0.5;

          if (shouldStore) {
            ephemeralShards.set(resolvedPacketId, shard);

            const published = await meshLibp2pAdapter.publishEmoShard('/hgi/emoshard/1.0.0', shard);
            if (!published) {
              throw new DaemonError('GOSSIP_PUBLISH_FAILED', 'Failed to publish shard to gossip');
            }

            if (ulxMeta !== null) {
              const ok = await meshLibp2pAdapter.publishJson(HGI_TOPIC_ULX_METADATA, {
                packet_id: ulxMeta.packet_id,
                ethical_metadata: ulxMeta.ethical_metadata,
                timestamp_ms: Date.now(),
              });
              if (!ok) {
                throw new DaemonError('GOSSIP_PUBLISH_FAILED', 'Failed to publish ULX metadata to gossip');
              }

              meshLibp2pAdapter.recordUlxMetadata(ulxMeta.packet_id, ulxMeta.ethical_metadata, Date.now());
            }
          }

          json(res, 200, { ok: true, id: resolvedPacketId, stored: shouldStore, gate_score: gateScore });
          return;
        }

        json(res, 404, { ok: false, error: 'not_found' });
      } catch (err) {
        const code = err instanceof DaemonError ? err.code : 'INTERNAL_ERROR';
        const message = err instanceof Error ? err.message : String(err);
        const status =
          code === 'BAD_JSON' || code === 'SHARD_INVALID' || code === 'TIMESTAMP_INVALID' || code === 'ROLE_INVALID'
            ? 400
            : code === 'SIGNATURE_MISSING' || code === 'SIGNATURE_INVALID'
              ? 401
              : code === 'PAYLOAD_TOO_LARGE'
                ? 413
                : 500;
        json(res, status, { ok: false, error: code, message });
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => resolve());
    });

    daemonServer = server;
    daemonStarted = true;

    if (!shutdownHookInstalled) {
      shutdownHookInstalled = true;

      const shutdown = async (): Promise<void> => {
        try {
          await this.stop();
        } catch {
          // ignore
        }
      };

      process.once('SIGINT', () => {
        void shutdown();
      });
      process.once('SIGTERM', () => {
        void shutdown();
      });
    }

    return {
      started: true,
      peers_connected: meshLibp2pAdapter.getDiscoveredPeerCount(),
      timestamp: Date.now(),
    };
  },

  async stop(): Promise<DaemonNodeState> {
    if (daemonServer !== null) {
      await new Promise<void>((resolve) => {
        daemonServer?.close(() => resolve());
      });
    }
    daemonServer = null;
    daemonStarted = false;
    ephemeralShards.clear();

    await meshLibp2pAdapter.stop();

    return {
      started: false,
      peers_connected: 0,
      timestamp: Date.now(),
    };
  },

  async status(): Promise<DaemonNodeState> {
    return {
      started: daemonStarted,
      peers_connected: meshLibp2pAdapter.getDiscoveredPeerCount(),
      timestamp: Date.now(),
    };
  },
};
