export type BasicToken = {
  text: string;
};

function isAlphaNum(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code >= 0xc0
  );
}

export function basicTokenize(input: string): BasicToken[] {
  const s = input.normalize('NFKC').trim();
  if (s.length === 0) return [];

  const out: BasicToken[] = [];
  let cur = '';

  const pushCur = (): void => {
    const t = cur.trim();
    if (t.length > 0) out.push({ text: t });
    cur = '';
  };

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i] ?? '';
    if (isAlphaNum(ch)) {
      cur += ch;
      continue;
    }

    pushCur();

    if (!/\s/.test(ch)) {
      out.push({ text: ch });
    }
  }

  pushCur();

  for (let i = 0; i < out.length; i += 1) {
    out[i] = { text: out[i]?.text.toLowerCase() ?? '' };
  }

  return out;
}
