import fs from 'node:fs/promises';

import { evaFromWavBuffer } from '../../modules/pipelines/eva.js';
import { hevFromText } from '../../modules/pipelines/hev.js';
import { molieFromText } from '../../modules/pipelines/molie.js';

async function readFileBytes(p: string): Promise<Buffer> {
  const buf = await fs.readFile(p);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

function print(obj: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(obj, null, 2));
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;

  if (cmd === 'eva') {
    const filePath = rest[0];
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('Usage: pnpm eva <file.wav>');
    }
    const buf = await readFileBytes(filePath);
    const out = await evaFromWavBuffer(buf);
    print(out);
    return;
  }

  if (cmd === 'hev') {
    const text = rest.join(' ').trim();
    if (text.length === 0) {
      throw new Error('Usage: pnpm hev "texto"');
    }
    const out = await hevFromText(text);
    print(out);
    return;
  }

  if (cmd === 'molie') {
    const text = rest.join(' ').trim();
    if (text.length === 0) {
      throw new Error('Usage: pnpm molie "texto"');
    }
    const out = await molieFromText(text);
    print(out);
    return;
  }

  throw new Error('Usage: pnpm <eva|hev|molie> ...');
}

main(process.argv.slice(2)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
