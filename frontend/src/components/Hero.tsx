import { useEffect, useRef } from 'react';
import { Hero3D } from './Hero3D';

/* Mini landing-page mockups used as the collage behind the start card (original artwork, CSS only). */
const TILES = [
  { bg: '#f3ece2', a: '#c2410c', b: '#1f2937', shape: 'circle', x: '-2%', y: '6%', r: -8, w: 300 },
  { bg: '#e8eef6', a: '#1e3a8a', b: '#93c5fd', shape: 'pill', x: '16%', y: '52%', r: 6, w: 270 },
  { bg: '#111111', a: '#66b2ff', b: '#f5f5f7', shape: 'square', x: '3%', y: '62%', r: 4, w: 240 },
  { bg: '#f5e6e8', a: '#b08d57', b: '#5b3a29', shape: 'circle', x: '74%', y: '4%', r: 7, w: 290 },
  { bg: '#e7e5d8', a: '#4d5d2a', b: '#a3b18a', shape: 'pill', x: '82%', y: '50%', r: -6, w: 260 },
  { bg: '#ffffff', a: '#0071e3', b: '#1d1d1f', shape: 'square', x: '62%', y: '64%', r: -3, w: 250 },
  { bg: '#fff4d6', a: '#d97706', b: '#1f2937', shape: 'circle', x: '28%', y: '-6%', r: 3, w: 230 },
  { bg: '#eef2ff', a: '#7c3aed', b: '#c4b5fd', shape: 'square', x: '52%', y: '-8%', r: -5, w: 220 },
];

function Tile({ t }: { t: (typeof TILES)[number] }) {
  return (
    <div className="tile" style={{ left: t.x, top: t.y, width: t.w, transform: `rotate(${t.r}deg)`, background: t.bg }} aria-hidden="true">
      <div className="tile__nav"><i style={{ background: t.b }} /><span /><span /></div>
      <div className="tile__hero">
        <div className="tile__img" style={{ background: `color-mix(in srgb, ${t.a} 18%, ${t.bg})` }}>
          <b className={`tile__shape tile__shape--${t.shape}`} style={{ background: t.a }} />
        </div>
        <div className="tile__copy">
          <span style={{ background: t.b, width: '80%' }} /><span style={{ background: t.b, width: '55%', opacity: 0.5 }} />
          <span className="tile__price" style={{ background: t.a }} />
          <span className="tile__btn" style={{ background: t.b }} />
        </div>
      </div>
      <div className="tile__row">{[0, 1, 2].map((i) => <span key={i} style={{ background: `color-mix(in srgb, ${t.b} 10%, ${t.bg})` }} />)}</div>
    </div>
  );
}

function Count({ to, prefix = '', suffix = '' }: { to: string; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const nums = to.match(/\d+/g)?.map(Number) || []; let done = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || done) return; done = true; const t0 = performance.now();
      const step = (t: number) => { const k = Math.min(1, (t - t0) / 900); const ease = 1 - Math.pow(1 - k, 3); let i = 0;
        el.textContent = prefix + to.replace(/\d+/g, () => String(Math.round(nums[i++] * ease))) + suffix; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, [to, prefix, suffix]);
  return <b ref={ref}>{prefix}{to}{suffix}</b>;
}

export function Hero({ url, setUrl, start, busy, err }: { url: string; setUrl: (v: string) => void; start: () => void; busy: boolean; err: string }) {
  const input = useRef<HTMLInputElement>(null);
  const focus = () => { input.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => input.current?.focus(), 350); };
  return (
    <>
      {/* Apple-style product hero */}
      <section className="ahero">
        <div className="ahero__mark"><i />LP Builder</div>
        <h1>Designed for every launch.</h1>
        <p>Paste a Shopify product. Get four landing pages that rank, convert and stay editable.</p>
        <div className="ahero__cta">
          <button className="btn blue lg" onClick={focus}>Build pages</button>
          <a className="btn outline lg" href="#how">How it works</a>
        </div>
        <Hero3D />
      </section>

      {/* Shopify-style start stage */}
      <section className="stage2" id="start">
        <div className="stage2__collage">{TILES.map((t, i) => <Tile key={i} t={t} />)}</div>
        <div className="stage2__shade" />
        <div className="stage2__stack reveal">
          <div className="scard">
            <h2>Your next launch starts with one link</h2>
            <p>Brand, competitors, copy and SEO handled for you. Edit everything later in the theme editor.</p>
          </div>
          <form className="scard scard--dark" onSubmit={(e) => { e.preventDefault(); start(); }}>
            <h3>Start with a product URL</h3>
            <p>Any public Shopify product page works. We respect robots.txt and never copy competitors.</p>
            <div className="sinput">
              <input ref={input} aria-label="Product URL" placeholder="https://your-store.com/products/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button aria-label="Build pages" disabled={busy || !url}>{busy ? <span className="spin" /> : '→'}</button>
            </div>
            {err && <div className="err" style={{ color: '#ff8a8a' }}>{err}</div>}
          </form>
        </div>
      </section>

      {/* capability strip */}
      <section className="strip reveal" aria-label="Capabilities">
        {[0, 1].map((k) => (
          <div className="strip__track" key={k} aria-hidden={k === 1 || undefined}>
            {['Online Store 2.0', 'Dawn', 'Theme editor', 'Product schema', 'FAQPage', 'Lighthouse 90+', 'Indian D2C research'].map((w, i) => <span key={w} className={`strip__w strip__w--${i % 4}`}>{w}</span>)}
          </div>
        ))}
      </section>

      {/* feature cards */}
      <section className="wrap fcards" id="how">
        <div className="fcard reveal">
          <span className="fpill">Theme-editor ready</span>
          <h3>Every colour, font and block is a setting.</h3>
          <p>Pages ship as Online Store 2.0 sections and JSON templates. Your team edits them without code.</p>
          <div className="fan">{[TILES[0], TILES[3], TILES[4], TILES[1], TILES[5]].map((t, i) => <div key={i} className="fan__i" style={{ transform: `translateX(${(i - 2) * 64}px) rotate(${(i - 2) * 5}deg)`, zIndex: 5 - Math.abs(i - 2) }}><Tile t={{ ...t, x: '0', y: '0', r: 0, w: 0 }} /></div>)}</div>
        </div>
        <div className="fcard reveal">
          <span className="fpill">Learns every run</span>
          <h3>Never the same page twice.</h3>
          <p>Competitor patterns and your approvals are remembered per category. New designs must clear a distance check against the last twelve.</p>
          <div className="stats">
            <div><Count to="8–12" /><span>competitor pages studied</span></div>
            <div><Count to="22" /><span>pattern rules</span></div>
            <div><Count to="35" prefix="≥ " suffix="%" /><span>different from past designs</span></div>
            <div><Count to="4" /><span>design directions per product</span></div>
          </div>
        </div>
      </section>
    </>
  );
}
