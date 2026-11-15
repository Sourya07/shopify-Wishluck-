import { useCallback, useEffect, useRef, useState } from 'react';
import { api, money } from '../api';
import type { Cfg } from '../App';
import { BrandPanel } from '../components/BrandPanel';
import { CompetitorsPanel, LearningsPanel } from '../components/Research';
import { DesignsPanel } from '../components/Designs';

const STAGES = [['product', 'Product'], ['brand', 'Brand'], ['competitors', 'Competitors'], ['learnings', 'Learnings'], ['designs', 'Designs'], ['checks', 'Checks'], ['done', 'Done']];

export function RunPage({ id, cfg }: { id: string; cfg: Cfg | null }) {
  const [run, setRun] = useState<any>(null);
  const [tab, setTab] = useState('brand');
  const [toast, setToast] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const load = useCallback(() => api(`/runs/${id}`).then(setRun).catch((e) => setToast(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const es = new EventSource(`/api/runs/${id}/stream`);
    let t: any; es.onmessage = () => { clearTimeout(t); t = setTimeout(load, 250); };
    return () => es.close();
  }, [id, load]);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [run?.events?.length]);
  useEffect(() => { if (run?.designs?.length && tab === 'brand' && run.status === 'done') setTab('designs'); }, [run?.status]); // eslint-disable-line
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  if (!run) return <div className="wrap"><p className="muted" style={{ padding: 60 }}>Loading…</p></div>;

  const p = run.product; const idx = STAGES.findIndex(([s]) => s === run.stage);
  const generate = async () => { await api(`/runs/${id}/generate`, { json: {} }); flash('Generating designs…'); setTab('designs'); load(); };
  return (
    <div className="wrap">
      <div className="runhead">
        {p?.images?.[0] && <img src={p.images[0].src} alt="" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{run.category ? `${run.category} · ${run.group}` : 'Analysing'}</div>
          <h1>{p?.title || run.url}</h1>
          <div className="faint">{p ? `${money(p.price, p.currency)} · ${p.variants.length} variants · ${p.images.length} images · ` : ''}<a href={run.url} target="_blank" rel="noreferrer">{run.url}</a>{run.llm?.calls ? ` · LLM ${run.llm.calls} calls, $${run.llm.usd}` : ''}</div>
        </div>
        <a className="btn line sm" href={`/api/runs/${id}/zip`}>Download all (zip)</a>
      </div>
      <div className="stepper">
        {STAGES.map(([s, label], i) => <span key={s} className={`step ${run.status === 'error' ? '' : i < idx || run.stage === 'done' ? 'done' : i === idx ? (run.status === 'review' ? 'done' : 'now') : ''}`}>{label}</span>)}
        {run.status === 'error' && <span className="step chip bad">Error: {run.error}</span>}
      </div>
      {run.status === 'review' && (
        <div className="callout"><div><b>Analysis ready.</b> <span className="muted">Check the brand panel (fix any colour or font), review competitor learnings, then generate.</span></div>
          <button className="btn blue" onClick={generate}>Generate designs</button></div>
      )}
      <div className="log" ref={logRef} aria-live="polite">
        {run.events.map((e: any, i: number) => <div key={i} className={e.level}><time>{new Date(e.created_at).toLocaleTimeString()}</time>{e.message}</div>)}
      </div>
      <div className="tabs" style={{ marginTop: 24 }}>
        {[['brand', 'Brand', ''], ['competitors', 'Competitors', run.competitors.length], ['learnings', 'Learnings', run.learnings.length], ['designs', 'Designs', run.designs.length]].map(([k, l, n]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(String(k))}>{l}{n !== '' && <span className="n">{n}</span>}</button>)}
      </div>
      {tab === 'brand' && (run.brand ? <BrandPanel run={run} cfg={cfg} onSaved={() => { flash('Brand saved — it will be used for generation'); load(); }} onGenerate={generate} /> : <div className="empty">Reading the brand…</div>)}
      {tab === 'competitors' && <CompetitorsPanel comps={run.competitors} />}
      {tab === 'learnings' && <LearningsPanel learnings={run.learnings} memory={run.memory} category={run.category} />}
      {tab === 'designs' && <DesignsPanel run={run} reload={load} flash={flash} cfg={cfg} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
