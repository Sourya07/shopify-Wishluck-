import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Cfg } from '../App';

const DEVICES = [{ k: 'mobile', w: 360, h: 720, label: 'Mobile 360' }, { k: 'tablet', w: 768, h: 900, label: 'Tablet 768' }, { k: 'desktop', w: 1440, h: 900, label: 'Desktop 1440' }];

function Ring({ v, label }: { v?: number; label: string }) {
  const c = v == null ? 'var(--line)' : v >= 90 ? 'var(--ok)' : v >= 50 ? '#f5a623' : 'var(--bad)';
  return <div className="ringw"><div className="ring" style={{ ['--v' as any]: v ?? 0, ['--c' as any]: c }}><b>{v ?? '—'}</b></div>{label}</div>;
}

function Preview({ id, version }: { id: string; version: number }) {
  const [dev, setDev] = useState(DEVICES[0]);
  const box = useRef<HTMLDivElement>(null); const [avail, setAvail] = useState(800);
  useEffect(() => { const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width - 36)); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, []);
  const scale = Math.min(1, avail / dev.w);
  return (
    <div className="stage" ref={box}>
      <div className="stage__bar">
        <div className="seg">{DEVICES.map((d) => <button key={d.k} className={dev.k === d.k ? 'on' : ''} onClick={() => setDev(d)}>{d.label}</button>)}</div>
        <a className="btn line sm" href={`/preview/${id}`} target="_blank" rel="noreferrer">Open full page ↗</a>
      </div>
      <div className="device" style={{ width: dev.w * scale, height: dev.h * scale }}>
        <iframe key={id + version} title="Design preview" src={`/preview/${id}?v=${version}`} style={{ width: dev.w, height: dev.h, transform: `scale(${scale})` }} />
      </div>
    </div>
  );
}

export function DesignsPanel({ run, reload, flash, cfg }: { run: any; reload: () => void; flash: (m: string) => void; cfg: Cfg | null }) {
  const designs: any[] = run.designs;
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(''); const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState('');
  const [pubOpen, setPubOpen] = useState(false); const [pubOpts, setPubOpts] = useState({ assign: true, updateSeo: true, importIfMissing: true });
  const [v, setV] = useState(0);
  const d = designs.find((x) => x.id === sel) || designs[0];
  useEffect(() => { if (!sel && designs[0]) setSel(designs[0].id); }, [designs, sel]);
  if (!designs.length) return <div className="empty">{run.status === 'review' ? 'Review the brand, then press “Generate designs”.' : 'Designs appear here as they are generated…'}</div>;
  const act = async (label: string, fn: () => Promise<any>, ok: string) => { setBusy(label); try { const r = await fn(); flash(ok); reload(); return r; } catch (e: any) { flash(e.message); } finally { setBusy(''); } };
  const seo = d.seo; const lh = d.lighthouse; const div = d.diversity; const fp = d.fingerprint;
  return (
    <div className="designs">
      <div className="dlist">
        {designs.map((x) => (
          <button key={x.id} className={`ditem ${x.id === d.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{x.name}</b><span className={`chip ${x.status === 'published' ? 'blue' : x.status === 'approved' ? 'ok' : x.status === 'rejected' ? 'bad' : ''}`}>{x.status}</span></div>
            <div className="faint">{x.spec.tagline}</div>
            <div className="chips"><span className="chip">{x.fingerprint.heroType.replace('_', ' ')}</span><span className="chip">{x.fingerprint.colorMode}</span><span className="chip">{x.fingerprint.density}</span></div>
            <div className="meta"><span>SEO {x.seo.score.SEO} · AEO {x.seo.score.AEO} · GEO {x.seo.score.GEO}</span><span>{x.lighthouse ? `LH ${x.lighthouse.performance}` : ''}</span></div>
            <div className="meta"><span className={x.diversity.passed ? '' : ''} style={{ color: x.diversity.passed ? 'var(--ok)' : 'var(--warn)' }}>{Math.round(x.diversity.minHistory * 100)}% different {x.diversity.passed ? '✓' : '!'}</span><span>{x.templateSuffix}</span></div>
          </button>))}
        <a className="btn line sm" href={`/api/runs/${run.id}/zip`}>Download all as zip</a>
      </div>

      <div className="grid" style={{ gap: 20, minWidth: 0 }}>
        <div className="section-h" style={{ margin: 0 }}>
          <div><h2>{d.name}</h2><div className="faint">{d.spec.tagline}</div></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" disabled={!!busy} onClick={() => act('approve', () => api(`/designs/${d.id}/approve`, { json: {} }), 'Approved — stored as a positive signal')}>Approve</button>
            <button className="btn danger sm" disabled={!!busy} onClick={() => setRejecting(true)}>Reject</button>
            <button className="btn ghost sm" disabled={!!busy} onClick={async () => { const r = await act('regen', () => api(`/designs/${d.id}/regenerate`, { json: {} }), 'New variant generated'); if (r?.id) setSel(r.id); }}>{busy === 'regen' ? 'Regenerating…' : 'Regenerate'}</button>
            <a className="btn line sm" href={`/api/designs/${d.id}/zip`}>Zip</a>
            <button className="btn blue sm" disabled={!!busy} onClick={() => setPubOpen(true)}>{busy === 'publish' ? 'Publishing…' : 'Publish to Shopify'}</button>
          </div>
        </div>
        {d.published && <div className="callout" style={{ margin: 0 }}><div><b>Published</b> <span className="muted">to “{d.published.themeName}” as {d.published.template}{d.published.productId ? ', assigned to the product' : ''}.</span>{d.published.warnings?.map((w: string) => <div key={w} className="faint">{w}</div>)}</div>
          <div style={{ display: 'flex', gap: 8 }}><a className="btn line sm" href={d.published.previewUrl} target="_blank" rel="noreferrer">Storefront ↗</a><a className="btn sm" href={d.published.editorUrl} target="_blank" rel="noreferrer">Theme editor ↗</a></div></div>}
        <Preview id={d.id} version={v} />

        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card"><h3>Scores</h3>
            <div className="scores">
              <Ring v={seo.score.SEO} label="SEO checklist" /><Ring v={seo.score.AEO} label="AEO" /><Ring v={seo.score.GEO} label="GEO" />
            </div>
            <div className="scores" style={{ marginTop: 18 }}>
              <Ring v={lh?.performance} label="LH performance" /><Ring v={lh?.accessibility} label="LH accessibility" /><Ring v={lh?.seo} label="LH SEO" /><Ring v={lh?.bestPractices} label="Best practices" />
            </div>
            <div className="faint" style={{ marginTop: 10 }}>{lh ? `Lighthouse mobile · ${lh.source}${lh.error ? ` · ${lh.error}` : ''}` : 'Lighthouse not run yet'}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn line sm" disabled={!!busy} onClick={() => act('lh', () => api(`/designs/${d.id}/lighthouse`, { json: {} }), 'Lighthouse finished')}>{busy === 'lh' ? 'Running…' : 'Run Lighthouse (preview)'}</button>
              {d.published && <button className="btn line sm" disabled={!!busy} onClick={() => act('lh', () => api(`/designs/${d.id}/lighthouse`, { json: { live: true } }), 'Lighthouse finished')}>Run on live store</button>}
            </div>
          </div>
          <div className="card"><h3>Diversity check</h3>
            <div className="faint" style={{ marginBottom: 8 }}>Distance to recent {run.category} designs (0 = identical, 1 = nothing in common). Must clear {div.threshold}.</div>
            {div.nearest?.length ? div.nearest.map((n: any) => (
              <div className="distrow" key={n.id}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                <div className="bar thresh" style={{ ['--t' as any]: div.threshold }}><i style={{ width: `${n.value * 100}%`, background: n.value >= div.threshold ? 'var(--blue)' : 'var(--bad)' }} /></div><b>{Math.round(n.value * 100)}%</b></div>
            )) : <div className="faint">No past designs in this category yet — first run sets the baseline.</div>}
            <div className="eyebrow" style={{ marginTop: 14 }}>Vs. sibling designs</div>
            {div.siblings.map((s: any, i: number) => <div className="distrow" key={i}><span>{s.name}</span><div className="bar"><i style={{ width: `${s.value * 100}%` }} /></div><b>{Math.round(s.value * 100)}%</b></div>)}
            {div.nearest?.[0] && <div className="faint" style={{ marginTop: 8 }}>Closest breakdown: order {div.nearest[0].parts.order}, sections {div.nearest[0].parts.sections}, attributes {div.nearest[0].parts.attributes}</div>}
            <div className="faint" style={{ marginTop: 8 }}>{div.why?.join(' · ')}</div>
          </div>
        </div>

        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card"><h3>SEO · AEO · GEO checklist</h3>
            {['SEO', 'AEO', 'GEO'].map((g) => (
              <div key={g} style={{ marginBottom: 12 }}><div className="eyebrow" style={{ margin: '6px 0' }}>{g} · {seo.score[g]}</div>
                <div className="checks">{seo.checks.filter((c: any) => c.group === g).map((c: any) => (
                  <div className="check" key={c.id}><span className={`ic ${c.status}`}>{c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : c.status === 'warn' ? '!' : '?'}</span><div>{c.label}<small>{c.detail}</small></div></div>))}</div>
              </div>))}
          </div>
          <div className="grid" style={{ gap: 16 }}>
            <div className="card"><h3>Layout fingerprint</h3>
              <table className="table"><tbody>
                {[['Direction', fp.direction], ['Hero', fp.heroType], ['Colour usage', fp.colorMode], ['ATC placement', fp.atcPlacement], ['Density', fp.density], ['Type scale', fp.typeScale], ['Imagery', fp.imageTreatment], ['Benefits', fp.benefitLayout], ['FAQ', fp.faqStyle]].map(([k, val]) => <tr key={k}><td className="faint">{k}</td><td>{val}</td></tr>)}
              </tbody></table>
              <div className="chips" style={{ marginTop: 10 }}>{fp.sectionOrder.map((s: string, i: number) => <span className="chip" key={i}>{i + 1}. {s.replace('_', ' ')}</span>)}</div>
            </div>
            <div className="card"><h3>Competitor learnings applied</h3>
              {d.spec.appliedLearnings.length ? <div className="chips">{d.spec.appliedLearnings.map((l: string) => { const L = run.learnings.find((x: any) => x.id === l); return <span key={l} className="chip blue" title={L?.statement}>{L ? `${L.statement}` : l.replace(/_/g, ' ')}</span>; })}</div> : <div className="faint">None met the 40% threshold.</div>}
            </div>
            <div className="card"><h3>Meta</h3><div style={{ fontSize: 14 }}><b>{d.content.seo.metaTitle}</b><div className="faint">{d.content.seo.metaDescription}</div><div className="faint" style={{ marginTop: 6 }}>Template: templates/product.{d.templateSuffix}.json · {Object.keys(d.template.sections).length} sections</div></div></div>
          </div>
        </div>
      </div>

      {rejecting && <div className="modal" onClick={() => setRejecting(false)}><div className="modal__in" onClick={(e) => e.stopPropagation()}>
        <h3>Reject “{d.name}”</h3><div className="faint">Optional reason — used to steer the next runs (e.g. “too dark”, “too busy”, “hero image too big”).</div>
        <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What was wrong?" />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setRejecting(false)}>Cancel</button>
          <button className="btn" onClick={async () => { setRejecting(false); await act('reject', () => api(`/designs/${d.id}/reject`, { json: { reason } }), 'Rejected — stored as a negative signal'); setReason(''); }}>Reject</button></div>
      </div></div>}
      {pubOpen && <div className="modal" onClick={() => setPubOpen(false)}><div className="modal__in" onClick={(e) => e.stopPropagation()}>
        <h3>Publish to Shopify</h3>
        {!cfg?.shopify && <div className="err">Shopify is not configured. Add SHOPIFY_STORE and an Admin API token in .env — or download the zip.</div>}
        <div className="faint">Uploads the lp-* sections, snippets, assets and <b>templates/product.{d.templateSuffix}.json</b> to an unpublished theme (never the live one unless allowed).</div>
        {([['assign', 'Assign this template to the product'], ['updateSeo', 'Set product meta title + description'], ['importIfMissing', 'Import the product into the dev store if missing']] as const).map(([k, l]) =>
          <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={pubOpts[k]} onChange={(e) => setPubOpts({ ...pubOpts, [k]: e.target.checked })} />{l}</label>)}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setPubOpen(false)}>Cancel</button>
          <button className="btn blue" disabled={!cfg?.shopify} onClick={async () => { setPubOpen(false); await act('publish', () => api(`/designs/${d.id}/publish`, { json: pubOpts }), 'Published to Shopify'); setV(v + 1); }}>Publish</button></div>
      </div></div>}
    </div>
  );
}
