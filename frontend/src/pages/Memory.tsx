import { useEffect, useState } from 'react';
import { api, ago } from '../api';
export function Memory() {
  const [m, setM] = useState<any>(null);
  useEffect(() => { api('/memory').then(setM); }, []);
  if (!m) return <div className="wrap"><p className="muted" style={{ padding: 40 }}>Loading…</p></div>;
  const cats = [...new Set(m.learnings.map((l: any) => l.category))] as string[];
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <div className="section-h"><div><h2 style={{ fontSize: 32 }}>Memory</h2><div className="faint">What the system has learned per category, the layouts it already built, and your feedback.</div></div></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card"><h3>Learnings by category</h3>
          {!cats.length && <div className="faint">Nothing yet.</div>}
          {cats.map((c, ci) => <details key={c} className="memcat" open={ci < 2}><summary className="eyebrow">{c.replace('group:', 'group · ')} <span className="faint">· {m.learnings.filter((l: any) => l.category === c).length}</span></summary>
            {m.learnings.filter((l: any) => l.category === c).slice(0, 10).map((l: any) => <div className="distrow" key={l.id} style={{ gridTemplateColumns: '1fr 90px 48px' }}><span style={{ fontSize: 13 }}>{l.id.replace(/^(unusual|gap|order):/, '$1 · ').replace(/_/g, ' ')}</span><div className="bar"><i style={{ width: `${l.count / l.total * 100}%` }} /></div><b style={{ textAlign: 'right' }}>{l.count}/{l.total}</b></div>)}</details>)}
        </div>
        <div className="grid" style={{ gap: 16 }}>
          <div className="card"><h3>Feedback signals</h3>
            {!m.signals.length ? <div className="faint">Approve, reject or publish designs to teach the system.</div> :
              <table className="table"><tbody>{m.signals.slice(0, 20).map((s: any) => <tr key={s.id}><td><span className={`chip ${s.kind === 'publish' ? 'blue' : s.kind === 'approve' ? 'ok' : 'bad'}`}>{s.kind}</span></td><td>{s.name}<div className="faint">{s.category}{s.reason ? ` · “${s.reason}”` : ''}</div></td><td className="faint">{ago(s.created_at)}</td></tr>)}</tbody></table>}
          </div>
          <div className="card"><h3>Layout fingerprints</h3>
            <table className="table"><thead><tr><th>Design</th><th>Hero</th><th>Colour</th><th>Order</th></tr></thead><tbody>
              {m.designs.slice(0, 24).map((d: any) => <tr key={d.id}><td><a href={`#/run/${d.runId}`}>{d.name}</a><div className="faint">{d.category} · {d.status}</div></td><td>{d.fingerprint.heroType}</td><td>{d.fingerprint.colorMode}</td><td className="faint" style={{ fontSize: 12 }}>{d.fingerprint.sectionOrder.filter((s: string) => s !== 'sticky_atc').join(' › ')}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}
