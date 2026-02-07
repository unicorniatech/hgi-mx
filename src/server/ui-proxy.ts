import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';

import { createESSEngine } from '../../modules/ess/ess-engine.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return fallback;
  return Math.floor(n);
}

function pipelineOutDir(): string {
  const raw = process.env.HGI_PIPELINE_OUT_DIR;
  if (typeof raw !== 'string' || raw.trim().length === 0) return path.resolve('/tmp/hgi');
  return path.resolve(raw.trim());
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 750): Promise<JsonValue> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed: JsonValue = null;
    try {
      parsed = text.length ? (JSON.parse(text) as JsonValue) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return parsed;
  } finally {
    clearTimeout(t);
  }
}

function mockUlxPacket(id: string): Record<string, unknown> {
  return {
    protocol: 'ulx/1.0.0',
    packet_type: 'ULX_PACKET',
    state: 'MOCK',
    packet_id: id,
    timestamp_ms: Date.now(),
    ethical_metadata: { ethical_color: 'yellow_caution', risk_flags: ['mock_data'] },
    states: [],
    final: 'RELEASE',
  };
}

type VoteRecord = {
  proposal_id: string;
  vote: 'up' | 'down';
  role?: string;
  timestamp_ms: number;
};

const voteStore = new Map<string, VoteRecord[]>();

function consensusStatusFor(proposalId: string): Record<string, unknown> {
  const votes = voteStore.get(proposalId) ?? [];
  const up = votes.filter((v) => v.vote === 'up').length;
  const down = votes.filter((v) => v.vote === 'down').length;
  const lastVotes = votes.slice(Math.max(0, votes.length - 50));

  return {
    ok: true,
    proposal_id: proposalId,
    counts: {
      up,
      down,
      total: votes.length,
    },
    votes: lastVotes,
    timestamp_ms: Date.now(),
  };
}

export async function startUiProxy(): Promise<void> {
  const port = readNumberEnv('HGI_UI_PORT', 7790);
  const daemonPort = readNumberEnv('HGI_DAEMON_PORT', 7777);
  const daemonBase = `http://127.0.0.1:${daemonPort}`;

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-hgi-role'],
  });

  const ess = createESSEngine();

  app.get('/api/ess', async (_req: FastifyRequest, reply: FastifyReply) => {
    const ids = await ess.list();
    reply.header('content-type', 'application/json; charset=utf-8');
    return ids;
  });

  app.get<{ Params: { id: string } }>('/api/ess/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = (req.params.id ?? '').trim();
    if (id.length === 0) return reply.code(400).send({ error: 'bad_request', message: 'missing id' });

    const bundle = await ess.get(id);
    if (!bundle) return reply.code(404).send({ error: 'not_found' });

    reply.header('content-type', 'application/json; charset=utf-8');
    return bundle;
  });

  app.get<{ Params: { id: string } }>('/api/ulx/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = (req.params.id ?? '').trim();
    if (id.length === 0) return reply.code(400).send({ error: 'bad_request', message: 'missing id' });

    const p = path.join(pipelineOutDir(), `ulx-${id}.json`);
    try {
      const raw = await fs.readFile(p, 'utf8');
      const parsed = JSON.parse(raw) as JsonValue;
      reply.header('content-type', 'application/json; charset=utf-8');
      return parsed;
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        reply.header('content-type', 'application/json; charset=utf-8');
        return mockUlxPacket(id);
      }
      throw err;
    }
  });

  app.get('/api/mesh/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await fetchJson(`${daemonBase}/status`);
      reply.header('content-type', 'application/json; charset=utf-8');
      return status;
    } catch (e: any) {
      reply.header('content-type', 'application/json; charset=utf-8');
      return {
        ok: false,
        error: 'daemon_unreachable',
        message: e?.message ?? String(e),
        daemon: daemonBase,
        status: { started: false, peers_connected: 0, timestamp: Date.now() },
      };
    }
  });

  app.get('/api/consensus/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const proposal_id = typeof q.proposal_id === 'string' ? q.proposal_id.trim() : '';
    if (proposal_id.length === 0) return reply.code(400).send({ error: 'bad_request', message: 'missing proposal_id' });

    reply.header('content-type', 'application/json; charset=utf-8');
    return consensusStatusFor(proposal_id);
  });

  app.post<{ Body: { proposal_id?: string; vote?: string; role?: string } }>(
    '/api/consensus/vote',
    async (req: FastifyRequest<{ Body: { proposal_id?: string; vote?: string; role?: string } }>, reply: FastifyReply) => {
    const proposal_id = typeof req.body?.proposal_id === 'string' ? req.body.proposal_id.trim() : '';
    const voteRaw = typeof req.body?.vote === 'string' ? req.body.vote.trim().toLowerCase() : '';
    const role = typeof req.body?.role === 'string' ? req.body.role.trim() : undefined;

    if (proposal_id.length === 0) return reply.code(400).send({ error: 'bad_request', message: 'missing proposal_id' });
    if (voteRaw !== 'up' && voteRaw !== 'down') return reply.code(400).send({ error: 'bad_request', message: 'vote must be up|down' });

    const rec: VoteRecord = {
      proposal_id,
      vote: voteRaw as 'up' | 'down',
      role,
      timestamp_ms: Date.now(),
    };

    const list = voteStore.get(proposal_id) ?? [];
    list.push(rec);
    voteStore.set(proposal_id, list);

    reply.header('content-type', 'application/json; charset=utf-8');
    return { ok: true, stored: true, count: list.length, status: consensusStatusFor(proposal_id) };
    },
  );

  await app.listen({ port, host: '127.0.0.1' });
}

const isMain = (() => {
  try {
    const selfPath = fileURLToPath(import.meta.url);
    const argvPath = typeof process.argv[1] === 'string' ? path.resolve(process.argv[1]) : '';
    return argvPath.length > 0 && path.resolve(selfPath) === argvPath;
  } catch {
    return false;
  }
})();

if (isMain) {
  startUiProxy().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[hgi] ui-proxy failed:', err);
    process.exitCode = 1;
  });
}

