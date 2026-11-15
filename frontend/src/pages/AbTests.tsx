import { useEffect, useState } from 'react';
import { api, ago } from '../api';
export function AbTests() {
  const [tests, setTests] = useState<any[]>([]); const [runs, setRuns] = useState<any[]>([]);
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => { api('/ab').then(setTests); api('/runs').then(setRuns); };
  useEffect(load, []);
  const options = runs.flatMap((r) => r.designs.filter((d: any) => d.status !== 'rejected').map((d: any) => ({ id: d.id, label: `${r.title} — ${d.name}`, run: r.id })));
  const runOf = (id: string) => options.find((o) => o.id === id)?.run;
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <div className="section-h"><div><h2 style={{ fontSize: 32 }}>A/B tests</h2><div className="faint">Publish two designs of the same product; visitors are split 50/50 by cookie and add-to-cart rate is tracked.</div></div></div>
      <div className="card" style={{ marginBottom: 20 }}><h3>New test</h3>
        <div className="row2">
          <select className="select" value={a} onChange={(e) => setA(e.target.value)}><option value="">Design A (assigned to product)</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          <select className="select" value={b} onChange={(e) => setB(e.target.value)}><option value="">Design B</option>{options.filter((o) => o.id !== a && (!a || o.run === runOf(a))).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </div>
        <button className="btn blue" style={{ marginTop: 12 }} disabled={!a || !b || busy} onClick={async () => { setBusy(true); setMsg(''); try { await api('/ab', { json: { designA: a, designB: b } }); setMsg('Test live — both templates published.'); load(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } }}>{busy ? 'Publishing…' : 'Start test'}</button>
        {msg && <div className="faint" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      {!tests.length ? <div className="empty">No tests yet.</div> : <table className="table"><thead><tr><th>Test</th><th>A</th><th>B</th><th>Started</th></tr></thead><tbody>
        {tests.map((t) => <tr key={t.id}><td>{t.product_handle}<div className="faint">{t.id}</div></td>
          {t.stats.map((s: any, i: number) => <td key={s.variant}><b>{i ? t.nameB : t.nameA}</b><div className="faint">{s.views} views · {s.atc} ATC · <b style={{ color: 'var(--fg)' }}>{s.rate}%</b></div></td>)}
          <td className="faint">{ago(t.created_at)}</td></tr>)}</tbody></table>}
    </div>
  );
}
