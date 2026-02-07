import fs from 'node:fs/promises';

import { basicTokenize } from './basic-tokenizer';

export async function loadVocabFile(vocabPath: string): Promise<Map<string, number>> {
  const content = await fs.readFile(vocabPath, 'utf8');
  const lines = content.split(/\r?\n/);

  const map = new Map<string, number>();
  for (let i = 0; i < lines.length; i += 1) {
    const tok = lines[i]?.trim();
    if (!tok) continue;
    if (!map.has(tok)) map.set(tok, map.size);
  }

  return map;
}

function basicTokenizeToStrings(text: string): string[] {
  return basicTokenize(text).map((t) => t.text);
}

function wordpieceTokenize(tokens: readonly string[], vocab: ReadonlyMap<string, number>): string[] {
  const out: string[] = [];

  for (const token of tokens) {
    if (vocab.has(token)) {
      out.push(token);
      continue;
    }

    const chars = Array.from(token);
    let start = 0;
    const subTokens: string[] = [];
    let isBad = false;

    while (start < chars.length) {
      let end = chars.length;
      let cur: string | null = null;

      while (start < end) {
        const piece = chars.slice(start, end).join('');
        const candidate = start === 0 ? piece : `##${piece}`;
        if (vocab.has(candidate)) {
          cur = candidate;
          break;
        }
        end -= 1;
      }

      if (cur === null) {
        isBad = true;
        break;
      }

      subTokens.push(cur);
      start = end;
    }

    if (isBad) {
      out.push('[UNK]');
    } else {
      out.push(...subTokens);
    }
  }

  return out;
}

export function encodeWordpieceBert(
  text: string,
  vocab: ReadonlyMap<string, number>,
  maxLength: number,
): { inputIds: BigInt64Array; attentionMask: BigInt64Array } {
  const clsId = vocab.get('[CLS]') ?? 101;
  const sepId = vocab.get('[SEP]') ?? 102;
  const padId = vocab.get('[PAD]') ?? 0;
  const unkId = vocab.get('[UNK]') ?? 100;

  const tokens = wordpieceTokenize(basicTokenizeToStrings(text), vocab);

  const ids: number[] = [clsId];
  for (const t of tokens) {
    ids.push(vocab.get(t) ?? unkId);
  }
  ids.push(sepId);

  const trimmed = ids.slice(0, Math.max(2, maxLength));

  const padded = new Array<number>(maxLength).fill(padId);
  const mask = new Array<number>(maxLength).fill(0);

  for (let i = 0; i < Math.min(trimmed.length, maxLength); i += 1) {
    padded[i] = trimmed[i] ?? padId;
    mask[i] = 1;
  }

  return {
    inputIds: BigInt64Array.from(padded.map((n) => BigInt(n))),
    attentionMask: BigInt64Array.from(mask.map((n) => BigInt(n))),
  };
}

export function encodeVocabTokens(
  text: string,
  vocab: ReadonlyMap<string, number>,
  maxLength: number,
): { inputIds: BigInt64Array; attentionMask: BigInt64Array } {
  const unkId = vocab.get('[UNK]') ?? 0;
  const padId = vocab.get('[PAD]') ?? 0;

  const tokens = basicTokenizeToStrings(text);

  const ids: number[] = [];
  for (const t of tokens) {
    ids.push(vocab.get(t) ?? unkId);
  }

  const trimmed = ids.slice(0, Math.max(1, maxLength));

  const padded = new Array<number>(maxLength).fill(padId);
  const mask = new Array<number>(maxLength).fill(0);

  for (let i = 0; i < Math.min(trimmed.length, maxLength); i += 1) {
    padded[i] = trimmed[i] ?? padId;
    mask[i] = 1;
  }

  return {
    inputIds: BigInt64Array.from(padded.map((n) => BigInt(n))),
    attentionMask: BigInt64Array.from(mask.map((n) => BigInt(n))),
  };
}
