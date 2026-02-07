import React from 'react';

import { Link } from 'react-router-dom';

import type { UIComponentProps } from '../../ui-core';

type EssBundle = {
  shard_id: string;
  shard_hash: string;
  ulx_state_id: string;
  created_at_ms: number;
  expires_at_ms: number;
  synthetic_audio: string;
  emotional_timeline: Array<{ t_ms: number; channel: string; value: number }>;
  scene_tags: string[];
};

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  const json = text.length ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return json;
}

function formatMs(ms: number): string {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(ms);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function pcm16leToAudioBuffer(ctx: AudioContext, pcm: Uint8Array, sampleRate = 16_000): AudioBuffer {
  const n = Math.floor(pcm.length / 2);
  const buffer = ctx.createBuffer(1, n, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < n; i += 1) {
    const lo = pcm[i * 2] ?? 0;
    const hi = pcm[i * 2 + 1] ?? 0;
    const v = (hi << 8) | lo;
    const s = v & 0x8000 ? v - 0x10000 : v;
    channel[i] = Math.max(-1, Math.min(1, s / 32768));
  }
  return buffer;
}

export default function ESSBrowser(props: UIComponentProps) {
  const { id } = props;

  const [ids, setIds] = React.useState<string[]>([]);
  const [bundle, setBundle] = React.useState<EssBundle | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      setErr(null);
      try {
        const list = (await fetchJson('/api/ess')) as unknown;
        if (!alive) return;
        setIds(Array.isArray(list) ? (list.filter((x) => typeof x === 'string') as string[]) : []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setErr(null);
      setBundle(null);
      try {
        const b = (await fetchJson(`/api/ess/${encodeURIComponent(id)}`)) as EssBundle;
        if (!alive) return;
        setBundle(b);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    if (id && id.trim().length > 0) {
      void run();
    }

    return () => {
      alive = false;
    };
  }, [id]);

  const onPlay = async () => {
    if (!bundle) return;
    if (playing) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const bytes = base64ToBytes(bundle.synthetic_audio);
      const buffer = pcm16leToAudioBuffer(ctx, bytes);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      setPlaying(true);
      src.start();
      src.onended = () => setPlaying(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setPlaying(false);
    }
  };

  const now = Date.now();
  const expired = bundle ? bundle.expires_at_ms <= now : false;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">ESS Browser</h1>
          <div className="mt-1 font-mono text-xs text-zinc-400">id={id}</div>
        </div>
        <div className="text-xs text-zinc-400">read-only synth audio</div>
      </div>

      {err ? (
        <div className="rounded border border-rose-700/50 bg-rose-500/10 p-3 text-sm text-rose-200">{err}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="text-sm font-semibold">Bundles</div>
          <div className="mt-2 max-h-[60vh] overflow-auto">
            {ids.length === 0 ? <div className="text-sm text-zinc-400">No bundles.</div> : null}
            <div className="space-y-1">
              {ids.map((x) => (
                <Link
                  key={x}
                  to={`/ess/${encodeURIComponent(x)}`}
                  className={`block rounded px-2 py-1 font-mono text-xs hover:bg-zinc-800/60 ${x === id ? 'bg-zinc-800/60' : ''}`}
                >
                  {x}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">Bundle detail</div>
            {expired ? <div className="rounded border border-amber-700/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">expired</div> : null}
          </div>

          {loading ? <div className="mt-3 text-sm text-zinc-400">Loading…</div> : null}
          {!bundle && !loading ? <div className="mt-3 text-sm text-zinc-400">Select a bundle.</div> : null}

          {bundle ? (
            <div className="mt-3 space-y-4">
              <div className="grid gap-2 text-sm">
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <div className="text-zinc-400">shard_id</div>
                  <div className="font-mono text-xs">{bundle.shard_id}</div>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <div className="text-zinc-400">ulx_state_id</div>
                  <div className="font-mono text-xs">{bundle.ulx_state_id}</div>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <div className="text-zinc-400">created</div>
                  <div className="font-mono text-xs">{formatMs(bundle.created_at_ms)}</div>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <div className="text-zinc-400">expires</div>
                  <div className="font-mono text-xs">{formatMs(bundle.expires_at_ms)}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold">Scene tags</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bundle.scene_tags.map((t) => (
                    <div key={t} className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 font-mono text-xs text-zinc-200">
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold">Synthetic waveform</div>
                  <button
                    type="button"
                    onClick={() => void onPlay()}
                    disabled={playing}
                    className="rounded border border-zinc-700 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800/60 disabled:opacity-50"
                  >
                    {playing ? 'Playing…' : 'Play'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">Audio is synthetic and read-only. No shard payload/PII displayed.</div>
              </div>

              <div>
                <div className="text-sm font-semibold">Emotional timeline</div>
                <div className="mt-2 max-h-64 overflow-auto rounded border border-zinc-800 bg-black/40 p-2">
                  <pre className="text-xs text-zinc-200">
                    {JSON.stringify(bundle.emotional_timeline.slice(0, 200), null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
