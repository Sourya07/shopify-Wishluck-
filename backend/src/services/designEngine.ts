/**
 * Design direction planner.
 *  - builds a pool of candidate layouts (direction × hero × order × colour usage × …)
 *  - adapts them to the data we really have (no reviews → no reviews section, etc.)
 *  - applies competitor learnings (sticky ATC, repeated ATC, rating by price, FAQ …)
 *  - scores against layout memory (distance to recent designs in this category),
 *    feedback signals (published / approved / rejected) and the user's brief
 *  - greedily picks 3–4 that are far from history AND from each other.
 */
import { config } from '../config.js';
import { db, j } from '../lib/db.js';
import { distance, fingerprintOf } from './fingerprint.js';
import type { DesignSpec, Fingerprint, Learning, Product, SectionKey } from '../types.js';

export type Brief = { competitorUrls?: string[]; autoGenerate?: boolean; concept?: string; notes?: string; creativity?: number; density?: number; polish?: number; count?: number; headingFont?: string; bodyFont?: string; colors?: string };

type Dir = { key: string; name: string; tagline: string; heroes: string[]; orders: SectionKey[][]; benefitLayouts: string[]; colorModes: Fingerprint['colorMode'][]; typeScales: Fingerprint['typeScale'][] };
export const DIRECTIONS: Dir[] = [
  { key: 'story', name: 'Story led', tagline: 'Big imagery, the “why” behind the product, then benefits and proof',
    heroes: ['overlay', 'editorial', 'split_right'], benefitLayouts: ['list_image', 'numbered'], colorModes: ['light', 'dark', 'tint'], typeScales: ['editorial', 'standard'],
    orders: [['hero', 'story', 'benefits', 'gallery', 'reviews', 'specs', 'faq', 'cta'], ['hero', 'trust_bar', 'story', 'gallery', 'benefits', 'reviews', 'faq', 'specs', 'cta'], ['hero', 'story', 'gallery', 'reviews', 'benefits', 'faq', 'cta', 'specs']] },
  { key: 'benefit_grid', name: 'Benefit grid', tagline: 'Quick-scan layout: icons, specs table and comparison',
    heroes: ['split_left', 'gallery_grid'], benefitLayouts: ['grid', 'cards'], colorModes: ['light', 'tint', 'bold'], typeScales: ['standard', 'compact'],
    orders: [['hero', 'trust_bar', 'benefits', 'specs', 'comparison', 'cta', 'reviews', 'faq'], ['hero', 'benefits', 'comparison', 'specs', 'reviews', 'faq', 'cta'], ['hero', 'benefits', 'cta', 'specs', 'comparison', 'faq', 'reviews']] },
  { key: 'social_proof', name: 'Social proof heavy', tagline: 'Ratings, reviews and real-life imagery take most of the space',
    heroes: ['split_right', 'stacked', 'split_left'], benefitLayouts: ['cards', 'grid'], colorModes: ['tint', 'light', 'bold'], typeScales: ['standard', 'editorial'],
    orders: [['hero', 'reviews', 'gallery', 'benefits', 'cta', 'faq', 'specs'], ['hero', 'trust_bar', 'reviews', 'benefits', 'gallery', 'faq', 'cta', 'specs'], ['hero', 'gallery', 'reviews', 'specs', 'faq', 'cta']] },
  { key: 'offer_led', name: 'Offer led', tagline: 'Price, delivery timeline and COD info up front',
    heroes: ['stacked', 'split_left', 'gallery_grid'], benefitLayouts: ['grid', 'numbered'], colorModes: ['bold', 'light', 'tint'], typeScales: ['compact', 'standard'],
    orders: [['hero', 'offer', 'trust_bar', 'benefits', 'reviews', 'faq', 'cta', 'specs'], ['hero', 'trust_bar', 'offer', 'specs', 'reviews', 'faq', 'cta'], ['hero', 'offer', 'benefits', 'cta', 'faq', 'specs']] },
  { key: 'spec_sheet', name: 'Facts first (GEO)', tagline: 'Minimal editorial page built around quotable facts: specs, who it’s for, FAQs',
    heroes: ['editorial', 'stacked', 'split_left'], benefitLayouts: ['numbered', 'list_image'], colorModes: ['light', 'dark'], typeScales: ['editorial', 'compact'],
    orders: [['hero', 'specs', 'story', 'faq', 'reviews', 'cta'], ['hero', 'specs', 'benefits', 'faq', 'cta', 'gallery'], ['hero', 'trust_bar', 'specs', 'faq', 'story', 'cta']] },
];

const imageTreatmentOf = (hero: string) => ({ overlay: 'full-bleed', editorial: 'editorial', gallery_grid: 'grid', stacked: 'centered', split_left: 'split', split_right: 'split' } as Record<string, string>)[hero] || 'split';

function atcPlacementOf(order: SectionKey[]) {
  const i = order.indexOf('cta'), off = order.indexOf('offer');
  const parts = ['hero'];
  if (off > 0 && off <= 2) parts.push('offer');
  if (i > 0) parts.push(i <= order.length / 2 ? 'mid' : 'end');
  return parts.concat('sticky').join('+');
}

export type Candidate = DesignSpec & { score: number; why: string[]; minHistory: number; nearest?: string };

/** make a candidate respect real data + learnings */
function adapt(order: SectionKey[], product: Product, learnings: Learning[], dir: Dir, applied: string[]) {
  let o = [...order];
  const L = (id: string) => learnings.find((l) => l.id === id && l.strength >= 0.4);
  if (!product.reviews.length) o = o.filter((s) => s !== 'reviews');
  if (product.specs.length < 2 && !product.descriptionText) o = o.filter((s) => s !== 'specs');
  if (product.specs.length < 3) o = o.filter((s) => s !== 'comparison');
  if (product.images.length < 3) o = o.filter((s) => s !== 'gallery');
  if (L('repeat_atc') && !o.includes('cta')) { const b = o.indexOf('benefits'); o.splice(b >= 0 ? b + 1 : Math.ceil(o.length / 2), 0, 'cta'); applied.push('repeat_atc'); }
  else if (L('repeat_atc')) applied.push('repeat_atc');
  if (L('faq') || L('faq_near_end')) { if (!o.includes('faq')) o.splice(Math.max(1, o.length - 1), 0, 'faq'); applied.push(L('faq_near_end') ? 'faq_near_end' : 'faq'); }
  if (!o.includes('faq')) o.splice(o.length - 1, 0, 'faq'); // AEO: every page gets an FAQ
  if (L('specs_table') && !o.includes('specs') && (product.specs.length >= 2 || product.descriptionText)) { o.splice(o.length - 1, 0, 'specs'); applied.push('specs_table'); }
  else if (L('specs_table') && o.includes('specs')) applied.push('specs_table');
  if (!o.includes('specs')) o.splice(o.length - 1, 0, 'specs'); // GEO: quotable facts on every page
  if (L('reviews_after_benefits') && o.includes('reviews') && o.includes('benefits') && o.indexOf('reviews') < o.indexOf('benefits') && dir.key !== 'social_proof') {
    o.splice(o.indexOf('reviews'), 1); o.splice(o.indexOf('benefits') + 1, 0, 'reviews'); applied.push('reviews_after_benefits');
  }
  if (L('trust_badges') && !o.includes('trust_bar') && dir.key !== 'spec_sheet') { o.splice(1, 0, 'trust_bar'); applied.push('trust_badges'); }
  if ((L('ugc') || L('many_images')) && o.includes('gallery')) applied.push(L('ugc') ? 'ugc' : 'many_images');
  if (learnings.find((l) => l.id === 'gap:comparison') && o.includes('comparison')) applied.push('gap:comparison');
  if (L('sticky_atc')) applied.push('sticky_atc');
  if (L('atc_above_fold_mobile')) applied.push('atc_above_fold_mobile');
  if (L('reviews_near_price') && product.rating) applied.push('reviews_near_price');
  if ((L('cod_near_atc') && product.policies.cod)) applied.push('cod_near_atc');
  if (L('delivery_estimate') && product.policies.delivery) applied.push('delivery_estimate');
  if (L('returns') && product.policies.returns) applied.push('returns');
  if (L('compare_at_discount') && product.compareAtPrice) applied.push('compare_at_discount');
  if (L('headline_benefit')) applied.push('headline_benefit');
  return [...new Set(o)] as SectionKey[];
}

const loadSignals = (category: string, group: string): any[] => db.prepare('SELECT kind, reason, fingerprint_json FROM signals WHERE category = ? OR category_group = ? ORDER BY id DESC LIMIT 200').all(category, group);
function feedbackScore(fp: Fingerprint, rows: any[]) {
  if (!rows.length) return { score: 0, notes: [] as string[] };
  let s = 0; const notes: string[] = [];
  for (const r of rows) {
    const w = r.kind === 'publish' ? 2 : r.kind === 'approve' ? 1 : -1.5;
    const f = j<Fingerprint>(r.fingerprint_json);
    if (!f) continue;
    for (const k of ['direction', 'heroType', 'colorMode', 'density', 'typeScale', 'benefitLayout'] as const) if (f[k] === fp[k]) s += w * 0.15;
    if (r.kind === 'reject' && r.reason) {
      const why = String(r.reason).toLowerCase();
      if (/dark/.test(why) && fp.colorMode === 'dark') { s -= 1; notes.push('rejected before for being dark'); }
      if (/(busy|clutter|too much|long|crowded)/.test(why) && (fp.density === 'compact' || fp.sectionOrder.length > 8)) { s -= 1; notes.push('rejected before as too busy'); }
      if (/(plain|boring|bland)/.test(why) && fp.colorMode === 'light' && fp.density === 'airy') { s -= 1; notes.push('rejected before as too plain'); }
      if (/(bright|loud|garish)/.test(why) && fp.colorMode === 'bold') { s -= 1; notes.push('rejected before as too loud'); }
      if (/(font|type|heading).*(big|large)/.test(why) && fp.typeScale === 'editorial') { s -= 0.8; notes.push('rejected before for large type'); }
      if (/(image|photo)/.test(why) && fp.heroType === f.heroType) { s -= 0.6; notes.push('hero imagery rejected before'); }
    }
  }
  return { score: Math.max(-3, Math.min(3, s / Math.sqrt(rows.length))), notes: [...new Set(notes)] };
}

/** layout memory: last N designs in this category + last N/2 in the wider group */
export function recentDesigns(category: string, group: string, excludeRun?: string) {
  const q = `SELECT id, name, run_id, fingerprint_json FROM designs WHERE %COND% AND run_id != ? AND status NOT IN ('discarded') ORDER BY created_at DESC LIMIT ?`;
  const cat: any[] = db.prepare(q.replace('%COND%', 'category = ?')).all(category, excludeRun ?? '', config.diversity.historyWindow);
  const grp: any[] = db.prepare(q.replace('%COND%', 'category_group = ? AND category != ?')).all(group, category, excludeRun ?? '', Math.ceil(config.diversity.historyWindow / 2));
  const rows = [...cat, ...grp];
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, runId: r.run_id as string, fp: j<Fingerprint>(r.fingerprint_json)! }));
}

const rand = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export function planDesigns(opts: { product: Product; category: string; group: string; learnings: Learning[]; runId: string; brief: Brief; exclude?: Fingerprint[]; count?: number; onlyDirection?: string }) {
  const { product, category, group, learnings, brief } = opts;
  const creativity = brief.creativity ?? 0.5, density = brief.density ?? 0.5;
  const count = opts.count ?? Math.min(4, Math.max(3, brief.count ?? 4));
  const history = recentDesigns(category, group, opts.runId);
  const extra = (opts.exclude ?? []).map((fp, i) => ({ id: `sibling-${i}`, name: 'current', runId: opts.runId, fp }));
  const rnd = rand([...opts.runId].reduce((a, c) => a + c.charCodeAt(0), 7) + Date.now() % 997);

  const densityOf = (): Fingerprint['density'] => (density < 0.34 ? 'airy' : density > 0.66 ? 'compact' : 'comfortable');
  const pool: Candidate[] = [];
  const signals = loadSignals(category, group);
  for (const dir of DIRECTIONS.filter((d) => !opts.onlyDirection || d.key === opts.onlyDirection)) {
    const prefDensity = densityOf();
    const densities: Fingerprint['density'][] = [prefDensity, ...(['comfortable', 'airy', 'compact'] as const).filter((x) => x !== prefDensity).slice(0, 1)];
    for (const baseOrder of dir.orders) for (const heroType of dir.heroes) for (const colorMode of dir.colorModes) for (const typeScale of dir.typeScales)
    for (const benefitLayout of dir.benefitLayouts) for (const faqStyle of ['accordion', 'centered', 'open']) for (const dens of densities) {
      const applied: string[] = [];
      let order = adapt(baseOrder, product, learnings, dir, applied);
      if (density < 0.3) order = order.filter((s, i) => i < 7 || s === 'faq' || s === 'cta'); // calm: fewer sections
      order.push('sticky_atc');
      const fp: Fingerprint = {
        direction: dir.key, heroType, sectionOrder: order, colorMode,
        atcPlacement: atcPlacementOf(order), density: dens,
        typeScale, imageTreatment: imageTreatmentOf(heroType), benefitLayout, faqStyle,
      };
      const dists = [...history, ...extra].map((h) => ({ h, d: distance(fp, h.fp).value }));
      const nearest = dists.sort((a, b) => a.d - b.d)[0];
      const minHistory = nearest ? nearest.d : 1;
      const fb = feedbackScore(fp, signals);
      const learnCover = applied.length / 10;
      const noise = rnd() * (0.05 + creativity * 0.35);
      const safeBias = (1 - creativity) * (learnCover * 0.3 + fb.score * 0.12);
      const densityPenalty = dens === prefDensity ? 0 : 0.08;
      const score = minHistory * (0.6 + creativity * 0.6) + safeBias + fb.score * 0.1 + noise - densityPenalty;
      const why = [`${Math.round(minHistory * 100)}% different from the closest past design${nearest ? ` (${nearest.h.name})` : ''}`];
      if (applied.length) why.push(`applies ${applied.length} learnings`);
      if (fb.score) why.push(`feedback ${fb.score > 0 ? '+' : ''}${fb.score.toFixed(2)}${fb.notes.length ? ' — ' + fb.notes.join(', ') : ''}`);
      pool.push({ ...fp, name: dir.name, tagline: dir.tagline, appliedLearnings: [...new Set(applied)], score, why, minHistory, nearest: nearest?.h.id });
    }
  }

  let threshold = config.diversity.minDistanceHistory + (creativity - 0.5) * 0.1;
  const relaxations: string[] = [];
  const pick = () => {
    const chosen: Candidate[] = [];
    const sorted = [...pool].sort((a, b) => b.score - a.score);
    for (const c of sorted) {
      if (chosen.length >= count) break;
      if (c.minHistory < threshold) continue;
      if (!opts.onlyDirection && chosen.some((x) => x.direction === c.direction || x.heroType === c.heroType)) continue;
      if (chosen.filter((x) => x.colorMode === c.colorMode).length >= 2) continue;
      if (chosen.some((x) => distance(x, c).value < config.diversity.minDistanceSiblings)) continue;
      chosen.push(c);
    }
    return chosen;
  };
  let chosen = pick();
  while (chosen.length < Math.min(count, opts.onlyDirection ? 1 : count) && threshold > 0.05) {
    threshold -= 0.05; relaxations.push(`relaxed history threshold to ${threshold.toFixed(2)} (pool exhausted)`); chosen = pick();
  }
  return { designs: chosen, history, threshold: +threshold.toFixed(2), relaxations, poolSize: pool.length };
}
