import React from 'react';

type MeshStatus = {
  node?: {
    peer_id?: string;
    roles?: string[];
    role_weight?: number;
  };
  peers?: Array<{
    peer_id?: string;
    roles?: string[];
    role_weight?: number;
  }>;
  shards?: {
    count?: number;
  };
  gossip_log?: Array<{ ts_ms: number; topic: string; message_id?: string }>;
};

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  const json = text.length ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return json;
}

export default function MeshDashboard() {
  const [data, setData] = React.useState<MeshStatus | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const reload = React.useCallback(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const status = (await fetchJson('/api/mesh/status')) as MeshStatus;
        if (!alive) return;
        setData(status);
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
  }, []);

  React.useEffect(() => reload(), [reload]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Mesh Dashboard</h1>
          <div className="mt-1 text-xs text-zinc-400">Peers / roles / weights / shards</div>
        </div>
        <button
          type="button"
          onClick={() => reload()}
          className="rounded border border-zinc-700 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800/60"
        >
          Refresh
        </button>
      </div>

      {loading ? <div className="text-sm text-zinc-400">Loading…</div> : null}
      {err ? (
        <div className="rounded border border-rose-700/50 bg-rose-500/10 p-3 text-sm text-rose-200">{err}</div>
      ) : null}

      {data ? (
        <div className="grid gap-4">
          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">Local node</div>
            <div className="mt-2 grid gap-1 font-mono text-xs text-zinc-200">
              <div>peer_id={data.node?.peer_id ?? 'unknown'}</div>
              <div>roles={(data.node?.roles ?? []).join(',') || 'none'}</div>
              <div>role_weight={typeof data.node?.role_weight === 'number' ? data.node?.role_weight : 'unknown'}</div>
            </div>
          </div>

          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">Peers</div>
            <div className="mt-3 space-y-2">
              {(data.peers ?? []).length === 0 ? <div className="text-sm text-zinc-400">No peers.</div> : null}
              {(data.peers ?? []).map((p, idx) => (
                <div key={`${p.peer_id ?? 'peer'}_${idx}`} className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="font-mono text-xs">peer_id={p.peer_id ?? 'unknown'}</div>
                  <div className="mt-1 text-xs text-zinc-400">roles={(p.roles ?? []).join(',') || 'none'}</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    weight={typeof p.role_weight === 'number' ? p.role_weight.toFixed(3) : 'unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">Shard stats</div>
            <div className="mt-2 font-mono text-xs text-zinc-200">count={data.shards?.count ?? 'unknown'}</div>
          </div>

          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">Gossip log</div>
            <div className="mt-2 max-h-64 overflow-auto rounded border border-zinc-800 bg-black/40 p-2">
              <pre className="text-xs text-zinc-200">{JSON.stringify(data.gossip_log ?? [], null, 2)}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
