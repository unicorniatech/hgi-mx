import { basicTokenize } from './basic-tokenizer';

export type BertEncoding = {
  inputIds: BigInt64Array;
  attentionMask: BigInt64Array;
  tokens: string[];
};

function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function clampInt(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export type BertTokenizerConfig = {
  maxLength: number;
  vocabSizeHint: number;
};

const DEFAULT_CFG: BertTokenizerConfig = {
  maxLength: 128,
  vocabSizeHint: 30_522,
};

export class MinimalBertTokenizer {
  private readonly cfg: BertTokenizerConfig;

  public constructor(cfg?: Partial<BertTokenizerConfig>) {
    this.cfg = { ...DEFAULT_CFG, ...(cfg ?? {}) };
  }

  private tokenToId(token: string): number {
    const vocab = Math.max(128, this.cfg.vocabSizeHint);
    const h = fnv1a32(token);
    const base = 1000;
    const id = base + (h % Math.max(1, vocab - base - 1));
    return clampInt(id, 0, vocab - 1);
  }

  public encode(text: string, maxLength?: number): BertEncoding {
    const maxLen = maxLength ?? this.cfg.maxLength;

    const clsId = 101;
    const sepId = 102;
    const padId = 0;

    const toks = basicTokenize(text).map((t) => t.text);

    const ids: number[] = [clsId];
    const tokens: string[] = ['[CLS]'];

    for (const tok of toks) {
      if (ids.length >= maxLen - 1) break;
      ids.push(this.tokenToId(tok));
      tokens.push(tok);
    }

    ids.push(sepId);
    tokens.push('[SEP]');

    const padded = new BigInt64Array(maxLen);
    const mask = new BigInt64Array(maxLen);

    for (let i = 0; i < maxLen; i += 1) {
      const v = ids[i];
      if (v === undefined) {
        padded[i] = BigInt(padId);
        mask[i] = 0n;
      } else {
        padded[i] = BigInt(v);
        mask[i] = 1n;
      }
    }

    return { inputIds: padded, attentionMask: mask, tokens };
  }
}
