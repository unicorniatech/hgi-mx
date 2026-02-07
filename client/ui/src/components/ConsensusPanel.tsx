import React from 'react';

type ConsensusStatus = {
  proposal_id?: string;
  score?: number;
  role_weighted_score?: number;
  votes?: Array<{ peer_id?: string; vote?: 'up' | 'down'; weight?: number }>;
  purifier_filters?: string[];
};

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  const json = text.length ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return json;
}

export default function ConsensusPanel() {
  const [status, setStatus] = React.useState<ConsensusStatus | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [proposalId, setProposalId] = React.useState('default');

  const reload = React.useCallback(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const s = (await fetchJson(`/api/consensus/status?proposal_id=${encodeURIComponent(proposalId)}`)) as ConsensusStatus;
        if (!alive) return;
        setStatus(s);
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
  }, [proposalId]);

  React.useEffect(() => reload(), [reload]);

  const vote = async (dir: 'up' | 'down') => {
    setErr(null);
    try {
      await fetchJson('/api/consensus/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, vote: dir }),
      });
      reload();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Consensus</h1>
          <div className="mt-1 text-xs text-zinc-400">Role-weighted votes + purifier filters</div>
        </div>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <div className="text-xs text-zinc-400">proposal_id</div>
            <input
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
              className="w-72 rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1 font-mono text-xs text-zinc-200 outline-none focus:border-indigo-400/60"
            />
          </label>

          <button
            type="button"
            onClick={() => reload()}
            className="rounded border border-zinc-700 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800/60"
          >
            Refresh
          </button>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => void vote('up')}
              className="rounded border border-emerald-700/50 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/15"
            >
              Upvote
            </button>
            <button
              type="button"
              onClick={() => void vote('down')}
              className="rounded border border-rose-700/50 bg-rose-500/10 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/15"
            >
              Downvote
            </button>
          </div>
        </div>
      </div>

      {loading ? <div className="text-sm text-zinc-400">Loading…</div> : null}
      {err ? (
        <div className="rounded border border-rose-700/50 bg-rose-500/10 p-3 text-sm text-rose-200">{err}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-sm font-semibold">Scores</div>
          <div className="mt-2 grid gap-1 font-mono text-xs text-zinc-200">
            <div>score={typeof status?.score === 'number' ? status.score.toFixed(3) : 'unknown'}</div>
            <div>
              role_weighted_score=
              {typeof status?.role_weighted_score === 'number' ? status.role_weighted_score.toFixed(3) : 'unknown'}
            </div>
          </div>
          <div className="mt-3 text-xs text-zinc-500">Note: UI does not show any shard intent/PII fields.</div>
        </div>

        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-sm font-semibold">Purifier filters</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(status?.purifier_filters ?? []).length === 0 ? <div className="text-sm text-zinc-400">None.</div> : null}
            {(status?.purifier_filters ?? []).map((f) => (
              <div key={f} className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 font-mono text-xs text-zinc-200">
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-sm font-semibold">Votes</div>
        <div className="mt-2 max-h-64 overflow-auto rounded border border-zinc-800 bg-black/40 p-2">
          <pre className="text-xs text-zinc-200">{JSON.stringify(status?.votes ?? [], null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
