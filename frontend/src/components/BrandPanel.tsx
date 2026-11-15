import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Cfg } from '../App';

const LABELS: Record<string, string> = { primary: 'Primary', secondary: 'Secondary', background: 'Background', text: 'Text', button: 'Button', buttonText: 'Button text', accent: 'Accent' };
export function BrandPanel({ run, cfg, onSaved, onGenerate }: { run: any; cfg: Cfg | null; onSaved: () => void; onGenerate: () => void }) {
  const [b, setB] = useState<any>(run.brand);
  const [pol, setPol] = useState<any>(run.product.policies);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) { setB(run.brand); setPol(run.product.policies); } }, [run.brand, run.product, dirty]);
  const upd = (fn: (x: any) => void) => { const c = structuredClone(b); fn(c); setB(c); setDirty(true); };
  const save = async () => { await api(`/runs/${run.id}/brand`, { method: 'PUT', json: { brand: b, policies: pol } }); setDirty(false); onSaved(); };
  const fontOpts = (cur: string) => (cfg?.fonts || []).flatMap((f) => [`${f.handle}_n4`, `${f.handle}_n7`]).concat(cur).filter((v, i, a) => a.indexOf(v) === i);
  const label = (h: string) => { const [base, w] = h.split(/_(?=n\d$)/); return `${cfg?.fonts.find((f) => f.handle === base)?.family || base} ${w === 'n7' ? 'Bold' : 'Regular'}`; };
  return (
    <div className="grid" style={{ gap: 24 }}>
      <div className="section-h"><div><h2>Brand</h2><div className="faint">Read from computed styles + a screenshot. Click any swatch to fix it before generating.</div></div>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn line" disabled={!dirty} onClick={save}>Save changes</button>{run.status === 'review' && <button className="btn blue" onClick={async () => { if (dirty) await save(); onGenerate(); }}>Save & generate</button>}</div></div>
      {b.evidence?.warning && <div className="callout" style={{ background: '#fff3e0', margin: 0 }}><div><b>Check the brand by hand.</b> <span className="muted">{b.evidence.warning}</span></div></div>}
      <div className="card"><h3>Colours</h3>
        <div className="swatches">{Object.keys(LABELS).map((k) => (
          <div className="sw" key={k}>
            <div className="sw__c" style={{ background: b.colors[k] }}><input type="color" aria-label={LABELS[k]} value={b.colors[k]} onChange={(e) => upd((c) => { c.colors[k] = e.target.value; })} /></div>
            <div className="sw__b"><small>{LABELS[k]}</small><input value={b.colors[k]} onChange={(e) => upd((c) => { c.colors[k] = e.target.value; })} /></div>
          </div>))}
        </div>
        {b.palette?.length > 0 && <><div className="palette">{b.palette.map((p: any) => <i key={p.hex} title={`${p.hex} · ${(p.share * 100).toFixed(1)}%`} style={{ background: p.hex, flex: p.share }} />)}</div><div className="faint">Screenshot palette (share of pixels)</div></>}
        <div className="evidence">{['brief', 'primary', 'button', 'secondary', 'background'].map((k) => b.evidence?.[k] && <div key={k}><b>{LABELS[k] || 'Brief'}:</b> {b.evidence[k]}</div>)}</div>
      </div>
      <div className="grid g2">
        <div className="card"><h3>Fonts</h3>
          {(['heading', 'body'] as const).map((k) => (
            <div className="field" key={k}><label style={{ textTransform: 'capitalize' }}>{k}</label>
              <select className="select" value={b.fonts[k].shopifyHandle} onChange={(e) => upd((c) => { c.fonts[k].shopifyHandle = e.target.value; c.fonts[k].family = label(e.target.value).replace(/ (Bold|Regular)$/, ''); })}>
                {fontOpts(b.fonts[k].shopifyHandle).map((h) => <option key={h} value={h}>{label(h)}</option>)}
              </select>
              <div className="evidence">{b.evidence?.[k + 'Font']} · {Math.round(b.fonts[k].sizePx)}px / {b.fonts[k].weight}</div>
            </div>))}
          <div style={{ padding: 16, background: b.colors.background, color: b.colors.text, borderRadius: 12, border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 24, fontWeight: b.fonts.heading.shopifyHandle.endsWith('7') ? 700 : 400, fontFamily: b.fonts.heading.family }}>{run.product.title}</div>
            <div style={{ fontFamily: b.fonts.body.family, marginTop: 6 }}>Body copy preview in {b.fonts.body.family}.</div>
            <button style={{ marginTop: 12, background: b.colors.button, color: b.colors.buttonText, border: 0, padding: '10px 18px', borderRadius: b.style.buttonStyle === 'pill' ? 99 : b.style.radius }}>Add to cart</button>
          </div>
        </div>
        <div className="card"><h3>Style & tone</h3>
          <div className="row2">
            <div className="field"><label>Tone of voice</label><select className="select" value={b.style.tone} onChange={(e) => upd((c) => { c.style.tone = e.target.value; })}>{['fun', 'premium', 'minimal', 'bold', 'earthy', 'techy', 'playful', 'classic'].concat(b.style.tone).filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>Button style</label><select className="select" value={b.style.buttonStyle} onChange={(e) => upd((c) => { c.style.buttonStyle = e.target.value; })}>{['pill', 'rounded', 'square'].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>Corner radius (px)</label><input className="input" type="number" min={0} max={40} value={b.style.radius} onChange={(e) => upd((c) => { c.style.radius = +e.target.value; })} /></div>
            <div className="field"><label>Spacing</label><select className="select" value={b.style.spacing} onChange={(e) => upd((c) => { c.style.spacing = e.target.value; })}>{['compact', 'comfortable', 'airy'].map((t) => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div className="field"><label>Brand name</label><input className="input" value={b.brandName} onChange={(e) => upd((c) => { c.brandName = e.target.value; })} /></div>
          <div className="faint">Tone notes: {b.style.toneNotes} · Images: {b.style.imageStyle}</div>
        </div>
      </div>
      <div className="card"><h3>Trust data (shown near add to cart)</h3>
        <div className="faint" style={{ marginBottom: 12 }}>Only real data goes on the page. These were found on the product page — correct or fill them from your store policies. Leave blank to hide.</div>
        <div className="grid g2">{(['delivery', 'cod', 'returns', 'shipping'] as const).map((k) => (
          <div className="field" key={k}><label>{{ delivery: 'Delivery estimate', cod: 'Cash on delivery', returns: 'Returns / exchange', shipping: 'Shipping offer' }[k]}</label>
            <input className="input" value={pol[k] || ''} placeholder="Not found on the page" onChange={(e) => { setPol({ ...pol, [k]: e.target.value || null }); setDirty(true); }} /></div>))}
        </div>
        <div className="faint">Rating: {run.product.rating ? `${run.product.rating.value} from ${run.product.rating.count} reviews (from the page's structured data)` : 'none shown on the product page, so no rating will be displayed'} · {run.product.reviews.length} review texts found</div>
      </div>
      {b.screenshot && <div className="card"><h3>Screenshot used</h3><img src={b.screenshot} alt="Product page screenshot" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)' }} /></div>}
    </div>
  );
}
