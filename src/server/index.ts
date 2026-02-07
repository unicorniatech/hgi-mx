import http from 'node:http';

import { route } from './router.js';
import { onnxRuntimeManager } from '../../modules/runtime/onnx-config.js';

function writeResponse(res: http.ServerResponse, status: number, headers: Record<string, string>, body: Buffer): void {
  res.writeHead(status, headers);
  res.end(body);
}

function makeServer(name: string): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const r = await route(req);
      writeResponse(res, r.status, r.headers ?? {}, r.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const body = Buffer.from(JSON.stringify({ error: 'internal_error', message: msg, server: name }));
      writeResponse(res, 500, { 'content-type': 'application/json; charset=utf-8' }, body);
    }
  });
}

export async function startServers(): Promise<void> {
  await onnxRuntimeManager.init();

  const core = makeServer('core');
  const debug = makeServer('debug');

  await new Promise<void>((resolve) => {
    core.listen(7700, '127.0.0.1', resolve);
  });

  await new Promise<void>((resolve) => {
    debug.listen(7701, '127.0.0.1', resolve);
  });

  // eslint-disable-next-line no-console
  console.log('[hgi] core listening on http://127.0.0.1:7700');
  // eslint-disable-next-line no-console
  console.log('[hgi] debug listening on http://127.0.0.1:7701');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServers().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[hgi] server failed:', err);
    process.exitCode = 1;
  });
}
