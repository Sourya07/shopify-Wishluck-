/**
 * Run orchestration.
 *   analyse  : product → brand → competitors → learnings   (then pauses for review)
 *   generate : plan designs → copy → JSON templates → preview → SEO/AEO/GEO → Lighthouse
 * Progress is streamed to the dashboard through the event bus (SSE).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db, now, j } from '../lib/db.js';
import { log, emitUpdate } from '../lib/events.js';
import { getUsage } from '../lib/llm.js';
import { uid, slugify } from '../lib/util.js';
import { parseColor } from '../lib/color.js';
import { mapToShopifyFont } from '../lib/fonts.js';
import { extractProduct } from './product.js';
import { categorize } from './category.js';
import { analyzeBrand } from './brand.js';
import { findCompetitors } from './search.js';
import { analyzeCompetitors } from './competitors.js';
import { deriveLearnings, saveLearnings, loadLearnings } from './learnings.js';
import { planDesigns, type Brief } from './designEngine.js';
import { distance, fingerprintOf } from './fingerprint.js';
import { writeCopy } from './copywriter.js';
import { buildTemplate } from './templateBuilder.js';
import { renderPage } from './preview.js';
import { runSeoChecks } from './seo.js';
import { runLighthouse } from './lighthouse.js';
import type { Brand, Competitor, DesignSpec, Learning, Product } from '../types.js';

export type RunRow = { id: string; url: string; status: string; category: string; category_group: string; product: Product; brand: Brand; competitors: Competitor[]; learnings: Learning[]; brief: Brief };
export function getRun(id: string): RunRow | null {
  const r: any = db.prepare('SELECT * FROM runs WHERE id = ?').get(id); if (!r) return null;
  const cost = j<any>(r.cost_json, {});
  return { id: r.id, url: r.url, status: r.status, category: r.category, category_group: r.category_group, product: j(r.product_json), brand: j(r.brand_json), competitors: j(r.competitors_json, []), learnings: j(r.learnings_json, []), brief: cost.brief || {} };
}
const setRun = (id: string, fields: Record<string, unknown>) => {
  const keys = Object.keys(fields); if (!keys.length) return;
  db.prepare(`UPDATE runs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => { const v = fields[k]; return typeof v === 'string' || v === null ? v : JSON.stringify(v); }), now(), id);
};
function saveCost(id: string, brief: Brief) { setRun(id, { cost_json: { brief, llm: getUsage(id) } }); }

const NAMED: Record<string, string> = { cream: '#f5efe2', cobalt: '#0047ab', 'cobalt blue': '#0047ab', black: '#111111', white: '#ffffff', navy: '#1b2a4a', olive: '#556b2f', sand: '#d8c7a6', terracotta: '#c8553d', forest: '#1f4d3a', coral: '#ff6f59', lavender: '#b8a9e3', mustard: '#d4a017', maroon: '#7a1f2b', teal: '#127475', pink: '#e86a92', red: '#d62828', orange: '#f77f00', green: '#2a9d8f', blue: '#2563eb', beige: '#efe6d8', charcoal: '#2b2b2b' };
export function applyBriefToBrand(brand: Brand, brief: Brief): Brand {
  const b: Brand = JSON.parse(JSON.stringify(brand));
  if (brief.colors) {
    const tokens = brief.colors.split(/[,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const hexes = tokens.map((t) => (parseColor(t) ? t : NAMED[t])).filter(Boolean) as string[];
    if (hexes[0]) { b.colors.primary = hexes[0]; b.colors.button = hexes[0]; b.colors.accent = hexes[0]; }
    if (hexes[1]) b.colors.secondary = hexes[1];
    if (hexes[2]) b.colors.background = hexes[2];
  }
  if (brief.headingFont) { const m = mapToShopifyFont(brief.headingFont, 700); b.fonts.heading = { ...b.fonts.heading, family: m.family, shopifyHandle: m.handle }; }
  if (brief.bodyFont) { const m = mapToShopifyFont(brief.bodyFont, 400); b.fonts.body = { ...b.fonts.body, family: m.family, shopifyHandle: m.handle }; }
  return b;
}

export function createRun(url: string, brief: Brief) {
  const id = uid('run_');
  db.prepare('INSERT INTO runs (id, url, status, stage, created_at, updated_at, cost_json) VALUES (?,?,?,?,?,?,?)').run(id, url, 'running', 'queued', now(), now(), JSON.stringify({ brief }));
  analyse(id, url, brief).catch((e) => { setRun(id, { status: 'error', error: e.message }); log(id, 'error', e.message, 'error'); emitUpdate(id, { status: 'error' }); });
  return id;
}

async function analyse(id: string, url: string, brief: Brief & { competitorUrls?: string[]; autoGenerate?: boolean }) {
  log(id, 'product', 'Reading product data from the Shopify storefront…');
  const product = await extractProduct(url);
  const { category, group } = categorize(product);
  setRun(id, { product_json: product, category, category_group: group });
  log(id, 'product', `Found “${product.title}” — ${product.variants.length} variants, ${product.images.length} images, ${product.specs.length} specs, rating: ${product.rating ? `${product.rating.value} (${product.rating.count})` : 'none shown'}. Category: ${category} (${group})`);
  emitUpdate(id, { stage: 'product' });

  log(id, 'brand', 'Rendering page to read computed colours, fonts and button style…');
  let brand = await analyzeBrand(product, id);
  if (brief.colors || brief.headingFont || brief.bodyFont) {
    brand = applyBriefToBrand(brand, brief);
    brand.evidence.brief = `Your brief overrides applied: ${[brief.colors && `colours “${brief.colors}”`, brief.headingFont && `heading font “${brief.headingFont}”`, brief.bodyFont && `body font “${brief.bodyFont}”`].filter(Boolean).join(', ')}`;
  }
  setRun(id, { brand_json: brand });
  if (brand.evidence.warning) log(id, 'brand', brand.evidence.warning, 'warn');
  log(id, 'brand', `Primary ${brand.colors.primary}, button ${brand.colors.button}, fonts ${brand.fonts.heading.family}/${brand.fonts.body.family}, tone: ${brand.style.tone}`);
  emitUpdate(id, { stage: 'brand' });

  const polish = brief.polish ?? 0.5;
  log(id, 'competitors', 'Finding competitor pages…');
  let comps: Competitor[];
  if (brief.competitorUrls?.length) {
    comps = brief.competitorUrls.slice(0, 15).map((u) => ({ url: u, domain: new URL(u).hostname.replace(/^www\./, ''), title: u, reason: 'Provided by you in the brief', source: 'manual', indianD2C: /\.in$/.test(new URL(u).hostname), status: 'pending' as const }));
  } else {
    comps = await findCompetitors(product, category, group, (m) => log(id, 'competitors', m));
  }
  comps = comps.slice(0, polish > 0.66 ? 12 : polish < 0.33 ? 8 : 10);
  setRun(id, { competitors_json: comps });
  log(id, 'competitors', `Picked ${comps.length} pages. Crawling (desktop + mobile, robots.txt respected, ${config.crawl.perHostDelayMs}ms per-host delay)…`);
  emitUpdate(id, { stage: 'competitors' });
  await analyzeCompetitors(id, comps, (m, lvl) => log(id, 'competitors', m, lvl), () => { setRun(id, { competitors_json: comps }); emitUpdate(id, { stage: 'competitors' }); });

  const fresh = deriveLearnings(comps);
  saveLearnings(category, fresh); saveLearnings(`group:${group}`, fresh);
  const memory = loadLearnings(category, group);
  const learnings = fresh.length ? fresh.map((l) => ({ ...l, memory: memory.find((m) => m.id === l.id) })) : memory;
  setRun(id, { learnings_json: learnings, status: 'review' });
  log(id, 'learnings', `${fresh.length} learnings from this run; ${memory.length} in ${category} memory. Review brand + learnings, then generate.`);
  saveCost(id, brief);
  emitUpdate(id, { stage: 'learnings', status: 'review' });
  if (brief.autoGenerate) await generate(id, brief);
}

export async function generate(id: string, briefIn?: Brief) {
  const run = getRun(id); if (!run) throw new Error('run not found');
  const brief = { ...run.brief, ...(briefIn || {}) };
  setRun(id, { status: 'running' }); saveCost(id, brief);
  try {
    const brand = run.brand; // brief was applied at analysis time; Brand-panel edits win from here on
    const learnings = run.learnings.length ? run.learnings : loadLearnings(run.category, run.category_group);
    log(id, 'designs', 'Planning design directions against layout memory and feedback…');
    const plan = planDesigns({ product: run.product, category: run.category, group: run.category_group, learnings, runId: id, brief });
    log(id, 'designs', `Pool of ${plan.poolSize} candidate layouts; ${plan.history.length} past ${run.category} designs in memory; diversity threshold ${plan.threshold}.${plan.relaxations.length ? ' ' + plan.relaxations.join('; ') : ''}`);
    db.prepare(`UPDATE designs SET status = 'discarded' WHERE run_id = ? AND status = 'draft'`).run(id);
    const idxStart = (db.prepare('SELECT COALESCE(MAX(idx), 0) AS m FROM designs WHERE run_id = ?').get(id) as any).m;
    const ids: string[] = [];
    for (const [k, spec] of plan.designs.entries()) {
      const designId = await buildDesign(run, brand, spec, brief, idxStart + k + 1, plan.history, plan.designs.filter((x) => x !== spec), plan.threshold);
      ids.push(designId);
      emitUpdate(id, { stage: 'designs' });
    }
    log(id, 'checks', 'Running SEO / AEO / GEO checklist and Lighthouse (mobile)…');
    const polish = brief.polish ?? 0.5;
    if (config.lighthouse && polish > 0) {
      for (const did of polish < 0.34 ? ids.slice(0, 1) : ids) {
        const lh = await runLighthouse(`http://127.0.0.1:${config.port}/preview/${did}`);
        db.prepare('UPDATE designs SET lighthouse_json = ? WHERE id = ?').run(JSON.stringify({ ...lh, source: 'local preview' }), did);
        log(id, 'checks', lh.error ? `Lighthouse failed: ${lh.error}` : `Lighthouse ${did}: perf ${lh.performance} · a11y ${lh.accessibility} · SEO ${lh.seo}`, lh.error ? 'warn' : 'info');
        emitUpdate(id, { stage: 'checks' });
      }
    }
    setRun(id, { status: 'done' }); saveCost(id, brief);
    log(id, 'done', `Generated ${ids.length} designs. LLM cost this run: $${getUsage(id).usd.toFixed(4)} (${getUsage(id).calls} calls).`);
    emitUpdate(id, { stage: 'done', status: 'done' });
  } catch (e: any) {
    setRun(id, { status: 'error', error: e.message }); log(id, 'error', e.message, 'error'); emitUpdate(id, { status: 'error' }); throw e;
  }
}

async function buildDesign(run: RunRow, brand: Brand, spec: DesignSpec & { why?: string[]; minHistory?: number; nearest?: string }, brief: Brief, idx: number, history: { id: string; name: string; fp: any }[], siblings: DesignSpec[], threshold: number) {
  const designId = uid('des_');
  const suffix = `lp-${slugify(run.category).slice(0, 12)}-${run.id.slice(4, 8)}-${idx}`;
  log(run.id, 'designs', `Writing copy for “${spec.name}” (${spec.heroType}, ${spec.colorMode})…`);
  const copy = await writeCopy(run.product, brand, spec, brief, run.id, run.category);
  const template = buildTemplate(spec, copy, brand, run.product);
  const fp = fingerprintOf(spec);
  const nearestList = history.map((h) => ({ id: h.id, name: h.name, ...distance(fp, h.fp) })).sort((a, b) => a.value - b.value).slice(0, 3);
  const sib = siblings.map((s) => ({ name: s.name, ...distance(fp, fingerprintOf(s)) }));
  const diversity = { threshold, minHistory: nearestList[0]?.value ?? 1, nearest: nearestList, siblings: sib, passed: (nearestList[0]?.value ?? 1) >= threshold, why: spec.why || [] };
  const html = await renderPage({ template, product: run.product, brand, meta: { title: copy.seo.metaTitle, description: copy.seo.metaDescription } });
  const dir = path.join(config.dataDir, 'runs', run.id, 'designs'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${designId}.html`), html);
  const seo = runSeoChecks(html, run.product, brand);
  db.prepare(`INSERT INTO designs (id, run_id, idx, category, category_group, direction, name, template_suffix, fingerprint_json, spec_json, content_json, template_json, diversity_json, seo_json, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(designId, run.id, idx, run.category, run.category_group, spec.direction, spec.name, suffix,
    JSON.stringify(fp), JSON.stringify(spec), JSON.stringify(copy), JSON.stringify(template), JSON.stringify(diversity), JSON.stringify(seo), 'draft', now());
  log(run.id, 'designs', `“${spec.name}” ready — ${Math.round(diversity.minHistory * 100)}% different from closest past design · SEO ${seo.score.SEO} / AEO ${seo.score.AEO} / GEO ${seo.score.GEO}`);
  return designId;
}

export async function regenerateDesign(designId: string) {
  const d: any = db.prepare('SELECT * FROM designs WHERE id = ?').get(designId); if (!d) throw new Error('design not found');
  const run = getRun(d.run_id)!; const brand = run.brand;
  const siblings: any[] = db.prepare(`SELECT * FROM designs WHERE run_id = ? AND id != ? AND status NOT IN ('discarded','rejected')`).all(d.run_id, designId);
  const exclude = [j(d.fingerprint_json), ...siblings.map((s) => j(s.fingerprint_json))];
  const plan = planDesigns({ product: run.product, category: run.category, group: run.category_group, learnings: run.learnings, runId: run.id, brief: run.brief, exclude, count: 1, onlyDirection: d.direction });
  const pick = plan.designs[0] || planDesigns({ product: run.product, category: run.category, group: run.category_group, learnings: run.learnings, runId: run.id, brief: run.brief, exclude, count: 1 }).designs[0];
  if (!pick) throw new Error('No sufficiently different variant left for this direction');
  db.prepare(`UPDATE designs SET status = 'discarded' WHERE id = ?`).run(designId);
  const maxIdx = (db.prepare('SELECT MAX(idx) AS m FROM designs WHERE run_id = ?').get(run.id) as any).m;
  const newId = await buildDesign(run, brand, pick, run.brief, maxIdx + 1, plan.history, siblings.map((s) => j(s.spec_json)), plan.threshold);
  if (config.lighthouse && (run.brief.polish ?? 0.5) > 0) {
    const lh = await runLighthouse(`http://127.0.0.1:${config.port}/preview/${newId}`);
    db.prepare('UPDATE designs SET lighthouse_json = ? WHERE id = ?').run(JSON.stringify({ ...lh, source: 'local preview' }), newId);
  }
  emitUpdate(run.id, { stage: 'designs' });
  return newId;
}
