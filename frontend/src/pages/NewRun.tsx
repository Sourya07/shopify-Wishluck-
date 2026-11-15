import { useMemo, useState } from 'react';
import { api, type Brief } from '../api';
import type { Cfg } from '../App';
import { Hero } from '../components/Hero';

const level = (v: number, a: string, b: string, c: string) => (v < 0.34 ? a : v > 0.66 ? c : b);
const SLIDERS: { key: 'creativity' | 'density' | 'polish'; title: string; ends: [string, string]; say: (v: number) => string; name: (v: number) => string }[] = [
  { key: 'creativity', title: 'Creativity', ends: ['Safe', 'Wild'], name: (v) => level(v, 'Safe', 'Balanced', 'Wild'),
    say: (v) => level(v, 'Leans on proven competitor patterns and designs you published before.', 'Mixes learned patterns with fresh layouts.', 'Pushes far from past designs; learnings are hints, not rules.') },
  { key: 'density', title: 'Density', ends: ['Calm', 'Busy'], name: (v) => level(v, 'Calm', 'Balanced', 'Busy'),
    say: (v) => level(v, 'Fewer sections, airy spacing, one idea per screen.', 'Standard rhythm for a product page.', 'More sections, compact spacing, maximum information.') },
  { key: 'polish', title: 'Polish', ends: ['Quick', 'Obsessive'], name: (v) => level(v, 'Quick', 'Standard', 'Obsessive'),
    say: (v) => level(v, '8 competitors, Lighthouse on one design.', '10 competitors, Lighthouse on every design.', '12 competitors, Lighthouse on every design.') },
];

export function NewRun({ cfg }: { cfg: Cfg | null }) {
  const [url, setUrl] = useState('');
  const [b, setB] = useState<Brief>({ creativity: 0.5, density: 0.5, polish: 0.5, count: 4 });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k: keyof Brief, v: any) => setB((x) => ({ ...x, [k]: v }));

  const start = async () => {
    setErr(''); setBusy(true);
    try { const { id } = await api<{ id: string }>('/runs', { json: { url, brief: b } }); location.hash = `#/run/${id}`; }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const brief = useMemo(() => {
    const m = (v: string | undefined, d: string) => (v?.trim() ? <mark>{v.trim()}</mark> : <mark className="def">{d}</mark>);
    const product = (() => { try { return new URL(url).pathname.split('/products/')[1]?.replace(/-/g, ' ') || ''; } catch { return ''; } })();
    return (
      <div className="brief">
        <span className="tag">{'<product>'}</span>{'\n'}Landing pages for {m(product, 'the pasted product')}. Read title, price, variants, images, specs and real reviews from the Shopify storefront.{'\n'}<span className="tag">{'</product>'}</span>{'\n\n'}
        <span className="tag">{'<brand>'}</span>{'\n'}Extract palette + fonts from computed styles and a screenshot.{'\n'}Concept: {m(b.concept, 'let the brand tone decide')}.{'\n'}Fonts: {m([b.headingFont, b.bodyFont].filter(Boolean).join(' / '), 'brand fonts, mapped to the Shopify library')}.{'\n'}Colours: {m(b.colors, 'brand palette from the page')}.{'\n'}<span className="tag">{'</brand>'}</span>{'\n\n'}
        <span className="tag">{'<research>'}</span>{'\n'}Find {m(b.competitorUrls ? 'your competitor URLs' : '', String(b.polish > 0.66 ? 12 : b.polish < 0.34 ? 8 : 10))} competitor pages, Indian D2C first. Crawl desktop + mobile, respect robots.txt. Learn patterns, never copy.{'\n'}<span className="tag">{'</research>'}</span>{'\n\n'}
        <span className="tag">{'<design>'}</span>{'\n'}{m(String(b.count), '4')} directions, each ≥ {m(String((0.35 + (b.creativity - 0.5) * 0.1).toFixed(2)), '0.35')} distance from recent designs in this category.{'\n'}Creativity: {m(SLIDERS[0].name(b.creativity), '')}. Density: {m(SLIDERS[1].name(b.density), '')}.{'\n'}ATC on the first mobile screen, sticky bar on scroll, real trust data only.{'\n'}{b.notes?.trim() ? <>Notes: {m(b.notes, '')}{'\n'}</> : null}<span className="tag">{'</design>'}</span>{'\n\n'}
        <span className="tag">{'<checks>'}</span>{'\n'}SEO · AEO · GEO checklist, Product + FAQPage schema, Lighthouse mobile ({m(SLIDERS[2].name(b.polish), '')}).{'\n'}<span className="tag">{'</checks>'}</span>
      </div>
    );
  }, [b, url]);

  return (
    <>
    <Hero url={url} setUrl={setUrl} start={start} busy={busy} err={err} />
    <div className="wrap">
      <h2 className="sec-title">Make it yours</h2>
      <section className="custom">
        <div>
          <p className="lead">Change any of these, or leave them blank to keep the defaults. They fill the highlighted parts of the brief.</p>
          <div className="field"><label>Concept</label><div className="hint">The one idea every page grows out of. Leave it to the brand tone, or give your own.</div>
            <input className="input" placeholder="e.g. built for Indian summers" value={b.concept || ''} onChange={(e) => set('concept', e.target.value)} /></div>
          <div className="field"><label>Fonts</label><div className="hint">A Google or Shopify font. Mapped to the closest font in Shopify's library.</div>
            <div className="row2">
              <input className="input" list="fontlist" placeholder="Heading font" value={b.headingFont || ''} onChange={(e) => set('headingFont', e.target.value)} />
              <input className="input" list="fontlist" placeholder="Body font" value={b.bodyFont || ''} onChange={(e) => set('bodyFont', e.target.value)} />
              <datalist id="fontlist">{cfg?.fonts.map((f) => <option key={f.handle} value={f.family} />)}</datalist>
            </div></div>
          <div className="field"><label>Colours</label><div className="hint">Colour names or hex codes, e.g. #0071E3, cream. First = primary, second = secondary, third = background.</div>
            <input className="input" placeholder="Keep brand palette" value={b.colors || ''} onChange={(e) => set('colors', e.target.value)} /></div>
          <div className="field"><label>Competitor URLs <span className="faint">(optional)</span></label><div className="hint">Skip search and learn from these pages instead.</div>
            <textarea className="input" placeholder="One URL per line" value={b.competitorUrls || ''} onChange={(e) => set('competitorUrls', e.target.value)} /></div>
          <div className="field"><label>Notes for the copywriter</label>
            <input className="input" placeholder="e.g. mention the festive season, avoid slang" value={b.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div>
          <div className="field"><label>Designs</label>
            <div className="seg">{[3, 4].map((n) => <button key={n} type="button" className={b.count === n ? 'on' : ''} onClick={() => set('count', n)}>{n} designs</button>)}</div></div>
          {SLIDERS.map((s) => (
            <div className="slider" key={s.key}>
              <div className="slider__top"><b>{s.title}</b><span>{s.name(b[s.key])}</span></div>
              <input type="range" min={0} max={1} step={0.01} value={b[s.key]} aria-label={s.title} onChange={(e) => set(s.key, +e.target.value)} />
              <div className="slider__ends"><span>{s.ends[0]}</span><span>{s.ends[1]}</span></div>
              <div className="slider__say">{s.say(b[s.key])}</div>
            </div>
          ))}
        </div>
        <aside className="briefcard">
          <div className="briefcard__top"><b>Generation brief</b><span className="tested">● Checked on every run</span></div>
          {brief}
          <div className="briefcard__foot"><span>{cfg?.llm ? `Copy: ${cfg.llm}` : 'Copy: deterministic templates (add LLM_API_KEY for AI copy)'}</span><span>{cfg?.shopify ? 'Publishes to ' + cfg.shopify : 'Zip download only'}</span></div>
        </aside>
      </section>
    </div>
    </>
  );
}
