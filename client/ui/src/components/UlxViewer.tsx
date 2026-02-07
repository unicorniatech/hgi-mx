import React from 'react';

import type { UIComponentProps } from '../../ui-core';

type UlxFrame = {
  layer: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | string;
  version: string;
  message_id: string;
  sender_node_id: string;
  timestamp: number;
  payload: unknown;
};

type UlxPacket = {
  protocol: string;
  packet_type: string;
  state: string;
  packet_id: string;
  timestamp_ms: number;
  ethical_metadata?: {
    ethical_color?: string;
    risk_flags?: string[];
  };
  states: UlxFrame[];
  final: string;
};

function pillClass(ethicalColor?: string): string {
  const c = (ethicalColor ?? '').toLowerCase();
  if (c.includes('green')) return 'bg-emerald-500/15 text-emerald-200 border-emerald-700/40';
  if (c.includes('yellow')) return 'bg-amber-500/15 text-amber-200 border-amber-700/40';
  if (c.includes('red')) return 'bg-rose-500/15 text-rose-200 border-rose-700/40';
  return 'bg-zinc-800/60 text-zinc-200 border-zinc-700/50';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactPII(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => redactPII(v));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'intention_core' || k === 'semantic_core') {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactPII(v);
      }
    }
    return out;
  }
  return value;
}

function safeJsonPreview(value: unknown): string {
  try {
    return JSON.stringify(redactPII(value), null, 2);
  } catch {
    return String(value);
  }
}

function extractEmotionVector(frame: UlxFrame): number[] | null {
  if (frame.layer !== 'C5') return null;
  const payload: any = frame.payload;
  const ev = payload?.shard?.emotion_vector;
  if (!Array.isArray(ev) || ev.some((n) => typeof n !== 'number')) return null;
  return ev;
}

function EmotionBars({ values }: { values: number[] }) {
  const maxAbs = Math.max(1e-6, ...values.map((v) => Math.abs(v)));
  return (
    <div className="mt-2 grid gap-2">
      {values.map((v, i) => {
        const pct = Math.min(1, Math.abs(v) / maxAbs);
        const w = Math.round(pct * 100);
        return (
          <div key={i} className="grid grid-cols-[40px_1fr_72px] items-center gap-2">
            <div className="text-xs text-zinc-400">ev_{i}</div>
            <div className="h-2 overflow-hidden rounded bg-zinc-800">
              <div
                className="h-2 rounded bg-indigo-400/80"
                style={{ width: `${w}%`, opacity: 0.35 + pct * 0.65 }}
              />
            </div>
            <div className="text-right font-mono text-xs text-zinc-200">{v.toFixed(3)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function UlxViewer(props: UIComponentProps) {
  const { id } = props;

  const [data, setData] = React.useState<UlxPacket | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const idTrim = (id ?? '').trim();
    if (idTrim.length === 0) return;

    let alive = true;
    const run = async () => {
      setLoading(true);
      setErr(null);
      setData(null);
      try {
        const res = await fetch(`/api/ulx/${encodeURIComponent(idTrim)}`);
        const text = await res.text();
        const json = text.length ? (JSON.parse(text) as UlxPacket) : null;
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        if (!alive) return;
        setData(json);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [id]);

  const ethicalColor = data?.ethical_metadata?.ethical_color;
  const riskFlags = data?.ethical_metadata?.risk_flags ?? [];

  const states: UlxFrame[] = data?.states ?? [];

  const c5 = states.find((s: UlxFrame) => s.layer === 'C5') ?? null;
  const emotionVector = c5 ? extractEmotionVector(c5) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">ULX Packet</h1>
          <div className="mt-1 font-mono text-xs text-zinc-400">id={id}</div>
        </div>
        <div className={`rounded border px-2 py-1 text-xs ${pillClass(ethicalColor)}`}>ethical={ethicalColor ?? 'unknown'}</div>
      </div>

      {riskFlags.length > 0 ? (
        <div className="rounded border border-amber-700/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          <div className="font-semibold">Risk flags</div>
          <div className="mt-1 font-mono text-xs">{riskFlags.join(', ')}</div>
        </div>
      ) : null}

      {loading ? <div className="text-sm text-zinc-400">Loading…</div> : null}
      {err ? (
        <div className="rounded border border-rose-700/50 bg-rose-500/10 p-3 text-sm text-rose-200">
          {err}
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-4">
          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">Timeline (C1–C6)</div>
            <div className="mt-3 space-y-3">
              {states.map((f: UlxFrame) => {
                const layer = f.layer;
                const ts = typeof f.timestamp === 'number' ? new Date(f.timestamp).toISOString() : 'unknown';
                return (
                  <div key={f.message_id} className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-sm">{layer}</div>
                      <div className="font-mono text-xs text-zinc-500">{ts}</div>
                    </div>
                    <pre className="mt-2 max-h-60 overflow-auto rounded bg-black/40 p-2 text-xs text-zinc-200">
                      {safeJsonPreview(f.payload)}
                    </pre>
                    {layer === 'C5' && emotionVector ? (
                      <div className="mt-2">
                        <div className="text-xs font-semibold text-zinc-300">Emotion vector (chart)</div>
                        <EmotionBars values={emotionVector} />
                        <div className="mt-2 text-xs text-zinc-500">Note: UI is read-only and does not display `intention_core`.</div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
