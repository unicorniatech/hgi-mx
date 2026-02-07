import type http from 'node:http';

import { evaFromWavBuffer } from '../../modules/pipelines/eva.js';
import { hevFromText } from '../../modules/pipelines/hev.js';
import { molieFromText } from '../../modules/pipelines/molie.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type RouterResponse = {
  status: number;
  headers?: Record<string, string>;
  body: Buffer;
};

async function readAll(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function json(res: unknown, status = 200, headers?: Record<string, string>): RouterResponse {
  const body = Buffer.from(JSON.stringify(res));
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(headers ?? {}) },
    body,
  };
}

function notFound(): RouterResponse {
  return json({ error: 'not_found' }, 404);
}

function badRequest(msg: string): RouterResponse {
  return json({ error: 'bad_request', message: msg }, 400);
}

function isJsonContentType(ct: string | undefined): boolean {
  if (!ct) return false;
  return ct.toLowerCase().includes('application/json');
}

function isWavContentType(ct: string | undefined): boolean {
  if (!ct) return false;
  const v = ct.toLowerCase();
  return v.includes('audio/wav') || v.includes('audio/wave') || v.includes('application/octet-stream');
}

function safeMethod(req: http.IncomingMessage): string {
  return (req.method ?? 'GET').toUpperCase();
}

function safeUrl(req: http.IncomingMessage): string {
  return req.url ?? '/';
}

export async function route(req: http.IncomingMessage): Promise<RouterResponse> {
  const method = safeMethod(req);
  const url = safeUrl(req);

  if (method === 'POST' && url === '/eva/audio') {
    const buf = await readAll(req);
    const ct = req.headers['content-type'];

    if (isWavContentType(typeof ct === 'string' ? ct : undefined)) {
      const out = await evaFromWavBuffer(buf);
      return json(out);
    }

    if (isJsonContentType(typeof ct === 'string' ? ct : undefined)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(buf.toString('utf-8')) as JsonValue;
      } catch {
        return badRequest('invalid json');
      }
      const rec = parsed as { wav_base64?: string };
      const b64 = rec.wav_base64;
      if (typeof b64 !== 'string' || b64.length === 0) return badRequest('missing wav_base64');
      const wav = Buffer.from(b64, 'base64');
      const out = await evaFromWavBuffer(wav);
      return json(out);
    }

    return badRequest('unsupported content-type; use audio/wav or application/json with wav_base64');
  }

  if (method === 'POST' && url === '/hev/text') {
    const buf = await readAll(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString('utf-8')) as JsonValue;
    } catch {
      return badRequest('invalid json');
    }
    const rec = parsed as { text?: string; maxLength?: number };
    if (typeof rec.text !== 'string') return badRequest('missing text');
    const maxLength = typeof rec.maxLength === 'number' && Number.isFinite(rec.maxLength) ? rec.maxLength : 128;
    const out = await hevFromText(rec.text, maxLength);
    return json(out);
  }

  if (method === 'POST' && url === '/molie/text') {
    const buf = await readAll(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString('utf-8')) as JsonValue;
    } catch {
      return badRequest('invalid json');
    }
    const rec = parsed as { text?: string; maxLength?: number };
    if (typeof rec.text !== 'string') return badRequest('missing text');
    const maxLength = typeof rec.maxLength === 'number' && Number.isFinite(rec.maxLength) ? rec.maxLength : 128;
    const out = await molieFromText(rec.text, maxLength);
    return json(out);
  }

  return notFound();
}
