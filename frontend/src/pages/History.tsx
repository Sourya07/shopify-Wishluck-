import { useEffect, useState } from 'react';
import { api, ago } from '../api';
export function History() {
  const [runs, setRuns] = useState<any[] | null>(null);
  useEffect(() => { api('/runs').then(setRuns); }, []);
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <div className="section-h"><div><h2 style={{ fontSize: 32 }}>History</h2><div className="faint">Every run, its designs and what was published.</div></div></div>
      {!runs ? <p className="muted">Loading…</p> : !runs.length ? <div className="empty">No runs yet.</div> : runs.map((r) => (
        <a className="histrow" key={r.id} href={`#/run/${r.id}`}>
          {r.image ? <img src={r.image} alt="" /> : <img alt="" />}
          <div><b>{r.title || r.url}</b><div className="faint">{r.category} · {ago(r.createdAt)} · {r.id}</div>
            <div className="chips" style={{ marginTop: 6 }}>{r.designs.map((d: any) => <span key={d.id} className={`chip ${d.status === 'published' ? 'blue' : d.status === 'approved' ? 'ok' : d.status === 'rejected' ? 'bad' : ''}`}>{d.name}{d.status !== 'draft' ? ` · ${d.status}` : ''}</span>)}</div></div>
          <span className={`chip ${r.status === 'done' ? 'ok' : r.status === 'error' ? 'bad' : 'blue'}`}>{r.status}</span>
        </a>))}
    </div>
  );
}
