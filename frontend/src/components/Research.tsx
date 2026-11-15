export function CompetitorsPanel({ comps }: { comps: any[] }) {
  if (!comps.length) return <div className="empty">Searching for competitor pages…</div>;
  return (
    <>
      <div className="section-h"><div><h2>Competitor pages</h2><div className="faint">{comps.filter((c) => c.status === 'ok').length} analysed · {comps.filter((c) => c.indianD2C).length} Indian D2C · patterns only, nothing copied</div></div></div>
      <div className="grid g3">{comps.map((c, i) => (
        <div className="comp" key={i}>
          <div className="comp__shots">
            {c.screenshots?.desktop ? <img src={c.screenshots.desktop} alt={`${c.domain} desktop`} loading="lazy" /> : <div style={{ background: 'var(--panel)' }} />}
            {c.screenshots?.mobile ? <img src={c.screenshots.mobile} alt={`${c.domain} mobile`} loading="lazy" /> : <div style={{ background: 'var(--panel)' }} />}
          </div>
          <div className="comp__b">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{c.domain}</b><span className={`chip ${c.status === 'ok' ? 'ok' : c.status === 'pending' ? '' : 'bad'}`}>{c.status}</span></div>
            <a href={c.url} target="_blank" rel="noreferrer" className="faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</a>
            <div className="faint"><b style={{ color: 'var(--fg)', fontSize: 12 }}>Why: </b>{c.reason}</div>
            {c.features && <div className="chips">{c.features.sectionOrder.map((s: string, k: number) => <span className="chip" key={k}>{s}</span>)}</div>}
            {c.features && <div className="chips">
              {c.features.reviewsNearPrice && <span className="chip blue">rating by price</span>}{c.features.stickyAtcMobile && <span className="chip blue">sticky ATC</span>}
              {c.features.repeatedAtc && <span className="chip blue">repeat ATC</span>}{c.features.codMentioned && <span className="chip blue">COD</span>}
              {c.features.hasFaq && <span className="chip blue">FAQ</span>}{c.features.urgency && <span className="chip warn">urgency</span>}
              {c.features.unusual.map((u: string) => <span className="chip warn" key={u}>{u}</span>)}</div>}
            {c.error && <div className="faint" style={{ color: 'var(--bad)' }}>{c.error}</div>}
          </div>
        </div>))}
      </div>
    </>
  );
}

export function LearningsPanel({ learnings, memory, category }: { learnings: any[]; memory: any[]; category: string }) {
  if (!learnings.length) return <div className="empty">Learnings appear once competitor pages are analysed.</div>;
  return (
    <div className="grid learn-grid">
      <div>
        <div className="section-h"><h2>What works on these pages</h2></div>
        {learnings.map((l) => (
          <div className="learn" key={l.id}>
            <div className="frac">{l.count}<small>/{l.total}</small></div>
            <div><div>{l.statement}</div>
              <div className="bar" style={{ margin: '8px 0 6px' }}><i style={{ width: `${(l.count / l.total) * 100}%` }} /></div>
              <div className="chips">{l.sources.slice(0, 6).map((s: string, i: number) => <a key={i} className="chip" href={s} target="_blank" rel="noreferrer">{(() => { try { return new URL(s).hostname.replace('www.', '') + (new URL(s).hostname === 'localhost' ? new URL(s).pathname.split('/').slice(0, 3).join('/') : ''); } catch { return s; } })()}</a>)}</div>
            </div>
            {l.memory && l.memory.total > l.total ? <span className="chip blue" title="cumulative across runs">memory {l.memory.count}/{l.memory.total}</span> : <span />}
          </div>))}
      </div>
      <div className="card" style={{ position: 'sticky', top: 76 }}>
        <h3>{category} memory</h3>
        <div className="faint" style={{ marginBottom: 10 }}>Saved per category and reused by the next product. {memory.length} patterns stored.</div>
        {memory.slice(0, 12).map((m) => <div key={m.id} className="distrow" style={{ gridTemplateColumns: '1fr 48px' }}><span style={{ fontSize: 13 }}>{m.id.replace(/^(unusual|gap|order):/, '').replace(/_/g, ' ')}</span><b style={{ textAlign: 'right' }}>{Math.round(m.strength * 100)}%</b></div>)}
      </div>
    </div>
  );
}
