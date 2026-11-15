import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { config } from '../config.js';
import { db, now, j } from '../lib/db.js';
import { bus } from '../lib/events.js';
import { llmEnabled } from '../lib/llm.js';
import { uid } from '../lib/util.js';
import { createRun, generate, getRun, regenerateDesign } from '../services/pipeline.js';
import { loadLearnings } from '../services/learnings.js';
import { publishDesign, shopifyConfigured, themeFiles } from '../services/shopify.js';
import { renderPage } from '../services/preview.js';
import { runSeoChecks } from '../services/seo.js';
import { runLighthouse } from '../services/lighthouse.js';
import { parseProductUrl } from '../services/product.js';
import { SHOPIFY_FONTS } from '../lib/fonts.js';

export const api = Router();
// run the handler inside the promise so synchronous throws also become JSON errors (not Express's HTML page)
const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response) =>
  Promise.resolve().then(() => fn(req, res)).catch((e) => { if (!res.headersSent) res.status(400).json({ error: e?.message || String(e) }); });

const designOut = (d: any) => d && ({
  id: d.id, runId: d.run_id, idx: d.idx, name: d.name, direction: d.direction, status: d.status, rejectReason: d.reject_reason, templateSuffix: d.template_suffix,
  category: d.category, fingerprint: j(d.fingerprint_json), spec: j(d.spec_json), content: j(d.content_json), template: j(d.template_json),
  diversity: j(d.diversity_json), seo: j(d.seo_json), lighthouse: j(d.lighthouse_json), published: j(d.published_json), createdAt: d.created_at,
});

api.get('/config', (_req, res) => res.json({
  llm: llmEnabled() ? `${config.llm.provider} · ${config.llm.model}` : null,
  search: config.search.serpapiKey ? 'serpapi' : config.search.braveKey ? 'brave' : config.search.googleKey ? 'google-cse' : null,
  shopify: shopifyConfigured() ? config.shopify.store : null, lighthouse: config.lighthouse,
  fonts: SHOPIFY_FONTS.map((f) => ({ family: f.family, handle: f.handle })),
}));

api.post('/runs', wrap((req, res) => {
  const { url, brief = {} } = req.body || {};
  parseProductUrl(String(url || ''));
  if (brief.competitorUrls && typeof brief.competitorUrls === 'string') brief.competitorUrls = brief.competitorUrls.split(/[\s,]+/).filter((u: string) => /^https?:\/\//.test(u));
  res.json({ id: createRun(String(url).trim(), brief) });
}));

api.get('/runs', (_req, res) => {
  const rows: any[] = db.prepare('SELECT id, url, status, stage, category, category_group, product_json, created_at FROM runs ORDER BY created_at DESC LIMIT 100').all();
  const ds: any[] = db.prepare(`SELECT id, run_id, name, status, template_suffix, published_json FROM designs WHERE status != 'discarded'`).all();
  res.json(rows.map((r) => { const p = j<any>(r.product_json, {}); return { id: r.id, url: r.url, status: r.status, stage: r.stage, category: r.category, group: r.category_group, title: p?.title, image: p?.images?.[0]?.src, createdAt: r.created_at,
    designs: ds.filter((d) => d.run_id === r.id).map((d) => ({ id: d.id, name: d.name, status: d.status, published: j(d.published_json) })) }; }));
});

api.get('/runs/:id', wrap((req, res) => {
  const r: any = db.prepare('SELECT * FROM runs WHERE id = ?').get(req.params.id); if (!r) return res.status(404).json({ error: 'not found' });
  const designs = (db.prepare(`SELECT * FROM designs WHERE run_id = ? AND status != 'discarded' ORDER BY idx`).all(r.id) as any[]).map(designOut);
  const events = db.prepare('SELECT stage, message, level, created_at FROM run_events WHERE run_id = ? ORDER BY id').all(r.id);
  const cost = j<any>(r.cost_json, {});
  res.json({ id: r.id, url: r.url, status: r.status, stage: r.stage, error: r.error, category: r.category, group: r.category_group, createdAt: r.created_at,
    product: j(r.product_json), brand: j(r.brand_json), competitors: j(r.competitors_json, []), learnings: j(r.learnings_json, []), brief: cost.brief || {}, llm: cost.llm, designs, events,
    memory: r.category ? loadLearnings(r.category, r.category_group) : [] });
}));

api.get('/runs/:id/stream', (req, res) => {
  res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); res.flushHeaders();
  const on = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  bus.on(`run:${req.params.id}`, on);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { bus.off(`run:${req.params.id}`, on); clearInterval(ping); });
});

api.put('/runs/:id/brand', wrap((req, res) => {
  const run = getRun(String(req.params.id)); if (!run) throw new Error('not found');
  const { brand, policies } = req.body;
  if (brand) db.prepare('UPDATE runs SET brand_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ ...brand, confirmed: true }), now(), run.id);
  if (policies) db.prepare('UPDATE runs SET product_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ ...run.product, policies: { ...run.product.policies, ...policies } }), now(), run.id);
  res.json({ ok: true });
}));

api.post('/runs/:id/generate', wrap((req, res) => {
  const run = getRun(String(req.params.id)); if (!run) throw new Error('not found');
  if (!run.brand) throw new Error('analysis not finished');
  generate(run.id, req.body?.brief).catch(() => {});
  res.json({ ok: true });
}));

const getDesign = (id: string) => db.prepare('SELECT * FROM designs WHERE id = ?').get(id) as any;
function signal(d: any, kind: string, reason?: string) {
  db.prepare('INSERT INTO signals (design_id, category, category_group, kind, reason, fingerprint_json, created_at) VALUES (?,?,?,?,?,?,?)').run(d.id, d.category, d.category_group, kind, reason || null, d.fingerprint_json, now());
}
api.post('/designs/:id/approve', wrap((req, res) => { const d = getDesign(String(req.params.id)); db.prepare(`UPDATE designs SET status='approved' WHERE id=?`).run(d.id); signal(d, 'approve'); res.json({ ok: true }); }));
api.post('/designs/:id/reject', wrap((req, res) => { const d = getDesign(String(req.params.id)); const reason = String(req.body?.reason || '').slice(0, 300); db.prepare(`UPDATE designs SET status='rejected', reject_reason=? WHERE id=?`).run(reason, d.id); signal(d, 'reject', reason); res.json({ ok: true }); }));
api.post('/designs/:id/regenerate', wrap(async (req, res) => { res.json({ id: await regenerateDesign(String(req.params.id)) }); }));

api.put('/designs/:id/template', wrap(async (req, res) => {
  // lets the dashboard tweak copy/settings and re-render (same JSON the theme editor edits)
  const d = getDesign(String(req.params.id)); const run = getRun(d.run_id)!; const template = req.body.template;
  const brand = run.brand; const content = j<any>(d.content_json);
  const html = await renderPage({ template, product: run.product, brand, meta: { title: content.seo.metaTitle, description: content.seo.metaDescription } });
  fs.writeFileSync(path.join(config.dataDir, 'runs', run.id, 'designs', `${d.id}.html`), html);
  db.prepare('UPDATE designs SET template_json = ?, seo_json = ? WHERE id = ?').run(JSON.stringify(template), JSON.stringify(runSeoChecks(html, run.product, brand)), d.id);
  res.json(designOut(getDesign(d.id)));
}));

api.post('/designs/:id/lighthouse', wrap(async (req, res) => {
  const d = getDesign(String(req.params.id)); const pub = j<any>(d.published_json);
  const url = req.body?.live && pub?.previewUrl ? pub.previewUrl : `http://127.0.0.1:${config.port}/preview/${d.id}`;
  const lh = await runLighthouse(url);
  db.prepare('UPDATE designs SET lighthouse_json = ? WHERE id = ?').run(JSON.stringify({ ...lh, source: req.body?.live ? 'live storefront' : 'local preview' }), d.id);
  res.json(lh);
}));

api.post('/designs/:id/publish', wrap(async (req, res) => {
  const d = getDesign(String(req.params.id)); const run = getRun(d.run_id)!; const content = j<any>(d.content_json);
  const { assign = true, updateSeo = true, importIfMissing = true } = req.body || {};
  const result = await publishDesign({ suffix: d.template_suffix, templateJson: j(d.template_json), product: run.product, assign, seo: updateSeo ? { title: content.seo.metaTitle, description: content.seo.metaDescription } : undefined, importIfMissing });
  db.prepare(`UPDATE designs SET status='published', published_json=? WHERE id=?`).run(JSON.stringify({ ...result, at: now() }), d.id);
  if (assign) db.prepare(`UPDATE designs SET status='approved' WHERE run_id=? AND id != ? AND status='published'`).run(d.run_id, d.id);
  signal(d, 'publish');
  res.json(result);
}));

function zipTo(res: Response, name: string, files: { filename: string; value: string }[]) {
  res.attachment(name); const z = new ZipArchive({ zlib: { level: 9 } }); z.pipe(res);
  for (const f of files) z.append(f.value, { name: f.filename });
  z.append(`Upload with Shopify CLI (shopify theme push --only ...) or Online Store → Themes → Edit code.\nTemplate: ${files.find((f) => f.filename.startsWith('templates/'))?.filename ?? '—'}\n`, { name: 'README.txt' });
  z.finalize();
}
api.get('/designs/:id/zip', (req, res) => {
  const d = getDesign(req.params.id); if (!d) return res.sendStatus(404);
  zipTo(res, `${d.template_suffix}.zip`, [...themeFiles(), { filename: `templates/product.${d.template_suffix}.json`, value: JSON.stringify(j(d.template_json), null, 2) }]);
});
api.get('/runs/:id/zip', (req, res) => {
  const ds: any[] = db.prepare(`SELECT * FROM designs WHERE run_id = ? AND status != 'discarded'`).all(req.params.id);
  zipTo(res, `lp-run-${req.params.id}.zip`, [...themeFiles(), ...ds.map((d) => ({ filename: `templates/product.${d.template_suffix}.json`, value: JSON.stringify(j(d.template_json), null, 2) }))]);
});

api.get('/memory', (_req, res) => {
  const learnings = (db.prepare('SELECT * FROM learnings ORDER BY category, CAST(count AS REAL)/total DESC').all() as any[]).map((r) => ({ id: r.id, category: r.category, statement: r.statement, count: r.count, total: r.total, sources: j(r.sources_json, []), updatedAt: r.updated_at }));
  const signals = db.prepare('SELECT s.*, d.name FROM signals s LEFT JOIN designs d ON d.id = s.design_id ORDER BY s.id DESC LIMIT 100').all();
  const designs = (db.prepare(`SELECT id, run_id, name, category, status, fingerprint_json, created_at FROM designs WHERE status != 'discarded' ORDER BY created_at DESC LIMIT 60`).all() as any[]).map((d) => ({ id: d.id, runId: d.run_id, name: d.name, category: d.category, status: d.status, fingerprint: j(d.fingerprint_json), createdAt: d.created_at }));
  res.json({ learnings, signals, designs });
});

// ---- A/B tests ----
api.post('/ab', wrap(async (req, res) => {
  const a = getDesign(req.body.designA), b = getDesign(req.body.designB); if (!a || !b) throw new Error('pick two designs');
  const run = getRun(a.run_id)!; const id = uid('ab_');
  const withAb = (d: any, variant: 'a' | 'b') => { const t = j<any>(d.template_json); t.sections.ab = { type: 'lp-ab-test', settings: { enabled: true, test_id: id, variant, b_view: b.template_suffix, split: 50, endpoint: config.publicUrl } }; t.order = ['ab', ...t.order.filter((x: string) => x !== 'ab')]; return t; };
  const rb = await publishDesign({ suffix: b.template_suffix, templateJson: withAb(b, 'b'), product: run.product, assign: false, importIfMissing: true });
  const ra = await publishDesign({ suffix: a.template_suffix, templateJson: withAb(a, 'a'), product: run.product, assign: true, importIfMissing: true });
  db.prepare('INSERT INTO ab_tests (id, product_handle, design_a, design_b, created_at) VALUES (?,?,?,?,?)').run(id, run.product.handle, a.id, b.id, now());
  res.json({ id, a: ra, b: rb });
}));
api.post('/ab/:id/event', (req, res) => {
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (['a', 'b'].includes(body?.variant) && ['view', 'atc'].includes(body?.event)) db.prepare('INSERT INTO ab_events (test_id, variant, event, created_at) VALUES (?,?,?,?)').run(req.params.id, body.variant, body.event, now());
  res.sendStatus(204);
});
api.get('/ab', (_req, res) => {
  const tests: any[] = db.prepare('SELECT * FROM ab_tests ORDER BY created_at DESC').all();
  res.json(tests.map((t) => {
    const ev: any[] = db.prepare('SELECT variant, event, COUNT(*) n FROM ab_events WHERE test_id = ? GROUP BY variant, event').all(t.id);
    const n = (v: string, e: string) => ev.find((x) => x.variant === v && x.event === e)?.n ?? 0;
    return { ...t, nameA: getDesign(t.design_a)?.name, nameB: getDesign(t.design_b)?.name, stats: ['a', 'b'].map((v) => ({ variant: v, views: n(v, 'view'), atc: n(v, 'atc'), rate: n(v, 'view') ? +(n(v, 'atc') / n(v, 'view') * 100).toFixed(1) : 0 })) };
  }));
});
