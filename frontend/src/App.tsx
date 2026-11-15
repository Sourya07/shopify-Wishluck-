import { useEffect, useState } from 'react';
import { api } from './api';
import { NewRun } from './pages/NewRun';
import { RunPage } from './pages/Run';
import { History } from './pages/History';
import { Memory } from './pages/Memory';
import { AbTests } from './pages/AbTests';

export type Cfg = { llm: string | null; search: string | null; shopify: string | null; lighthouse: boolean; fonts: { family: string; handle: string }[] };
const useHash = () => { const [h, set] = useState(location.hash || '#/'); useEffect(() => { const on = () => set(location.hash || '#/'); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []); return h; };

export function App() {
  const hash = useHash();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  useEffect(() => { api<Cfg>('/config').then(setCfg).catch(() => {}); }, []);
  const [, route, id] = hash.split('/');
  // reveal-on-scroll for any element with .reveal (re-scanned on route change)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    const t = setTimeout(() => document.querySelectorAll('.reveal:not(.in)').forEach((e) => io.observe(e)), 50);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [hash]);
  const tab = (r: string, label: string) => <a className={`tab ${route === r || (!route && r === '') ? 'on' : ''}`} href={`#/${r}`}>{label}</a>;
  return (
    <>
      <nav className="nav"><div className="nav__in">
        <a className="brand" href="#/"><i />LP Builder</a>
        {tab('', 'New')}{tab('history', 'History')}{tab('memory', 'Memory')}{tab('ab', 'A/B tests')}
        <span className="sp" />
        {cfg && <div className="chips" style={{ gap: 6 }}>
          <span className={`pill ${cfg.llm ? 'on' : ''}`} title={cfg.llm || 'No LLM key: deterministic copy'}><span className="dot" />{cfg.llm ? 'AI copy' : 'Template copy'}</span>
          <span className={`pill ${cfg.search ? 'on' : ''}`} title={cfg.search || 'No search key: curated seed list'}><span className="dot" />{cfg.search ? `Search · ${cfg.search}` : 'Seed list'}</span>
          <span className={`pill ${cfg.shopify ? 'on' : ''}`} title={cfg.shopify || 'Shopify not configured'}><span className="dot" />{cfg.shopify ? cfg.shopify.replace('.myshopify.com', '') : 'No store'}</span>
        </div>}
      </div></nav>
      {route === 'run' && id ? <RunPage id={id} cfg={cfg} /> : route === 'history' ? <History /> : route === 'memory' ? <Memory /> : route === 'ab' ? <AbTests /> : <NewRun cfg={cfg} />}
      <footer className="foot"><div className="wrap">Wishluck · AI landing pages for Shopify · Pages are Online Store 2.0 sections, editable in the theme editor.</div></footer>
    </>
  );
}
