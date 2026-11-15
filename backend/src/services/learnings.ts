/**
 * Turns competitor features into short, sourced learnings and persists them
 * per category (cumulative across runs) so the next product in the same
 * category starts with prior knowledge.
 */
import { db, now, j } from '../lib/db.js';
import type { Competitor, CompetitorFeatures, Learning } from '../types.js';

type Rule = { id: string; test: (f: CompetitorFeatures) => boolean; text: (n: number, t: number) => string };
export const RULES: Rule[] = [
  { id: 'reviews_near_price', test: (f) => f.reviewsNearPrice, text: (n, t) => `${n} of ${t} pages show the star rating right next to the price` },
  { id: 'atc_above_fold_mobile', test: (f) => f.atcAboveFoldMobile, text: (n, t) => `${n} of ${t} pages have add-to-cart visible on the first mobile screen` },
  { id: 'sticky_atc', test: (f) => f.stickyAtcMobile, text: (n, t) => `${n} of ${t} pages keep a sticky add-to-cart bar on mobile while scrolling` },
  { id: 'repeat_atc', test: (f) => f.repeatedAtc, text: (n, t) => `${n} of ${t} pages repeat the add-to-cart button further down the page` },
  { id: 'faq', test: (f) => f.hasFaq, text: (n, t) => `${n} of ${t} pages answer objections in an FAQ block` },
  { id: 'faq_near_end', test: (f) => { const i = f.sectionOrder.indexOf('faq'); return i >= 0 && i >= f.sectionOrder.length - 3; }, text: (n, t) => `${n} of ${t} pages place the FAQ in the last three sections` },
  { id: 'specs_table', test: (f) => f.hasSpecsTable, text: (n, t) => `${n} of ${t} pages list specs / material details in a structured table or list` },
  { id: 'cod_near_atc', test: (f) => f.codMentioned, text: (n, t) => `${n} of ${t} pages mention Cash on Delivery` },
  { id: 'delivery_estimate', test: (f) => f.deliveryEstimate, text: (n, t) => `${n} of ${t} pages show a delivery estimate or dispatch time` },
  { id: 'returns', test: (f) => f.returnsMentioned, text: (n, t) => `${n} of ${t} pages state the return / exchange policy on the product page` },
  { id: 'compare_at_discount', test: (f) => f.priceShowsCompareAt || f.showsDiscountPct, text: (n, t) => `${n} of ${t} pages show a struck-through MRP or discount % beside the price` },
  { id: 'trust_badges', test: (f) => f.trustBadges, text: (n, t) => `${n} of ${t} pages use trust badges (secure checkout, authentic, certified)` },
  { id: 'reviews_section', test: (f) => f.hasReviewsSection, text: (n, t) => `${n} of ${t} pages have a dedicated customer-reviews section` },
  { id: 'reviews_after_benefits', test: (f) => { const b = f.sectionOrder.indexOf('benefits'), r = f.sectionOrder.indexOf('reviews'); return b >= 0 && r > b; }, text: (n, t) => `${n} of ${t} pages put reviews after the benefits / features block` },
  { id: 'video', test: (f) => f.hasVideo, text: (n, t) => `${n} of ${t} pages use video` },
  { id: 'ugc', test: (f) => f.ugcImages, text: (n, t) => `${n} of ${t} pages show customer / community photos` },
  { id: 'bundle', test: (f) => f.bundleOffer, text: (n, t) => `${n} of ${t} pages push combos, bundles or multi-buy offers` },
  { id: 'urgency', test: (f) => f.urgency, text: (n, t) => `${n} of ${t} pages use urgency cues (low stock, timers) — we only use them with real data` },
  { id: 'size_guide', test: (f) => f.hasSizeGuide, text: (n, t) => `${n} of ${t} pages link a size chart / guide near the variant picker` },
  { id: 'comparison', test: (f) => f.hasComparison, text: (n, t) => `${n} of ${t} pages include a comparison (vs. alternatives or between variants)` },
  { id: 'headline_benefit', test: (f) => f.headlineStyle === 'benefit', text: (n, t) => `${n} of ${t} pages use a benefit-style headline instead of just the product name` },
  { id: 'many_images', test: (f) => f.imageCount >= 6, text: (n, t) => `${n} of ${t} pages show 6+ product images` },
];

export function deriveLearnings(comps: Competitor[]): Learning[] {
  const ok = comps.filter((c) => c.status === 'ok' && c.features);
  const t = ok.length; if (!t) return [];
  const out: Learning[] = [];
  for (const r of RULES) {
    const src = ok.filter((c) => r.test(c.features!)).map((c) => c.url);
    if (!src.length) continue;
    out.push({ id: r.id, statement: r.text(src.length, t), count: src.length, total: t, sources: src, strength: +(src.length / t).toFixed(2) });
  }
  // unusual patterns worth noting
  const unusual = new Map<string, string[]>();
  ok.forEach((c) => c.features!.unusual.forEach((u) => unusual.set(u, [...(unusual.get(u) || []), c.url])));
  for (const [u, src] of unusual) out.push({ id: `unusual:${u}`, statement: `Unusual: ${u} (${src.length} of ${t})`, count: src.length, total: t, sources: src, strength: +(src.length / t).toFixed(2) });
  // opportunities: things almost nobody does
  for (const r of RULES.filter((x) => ['comparison', 'specs_table', 'faq', 'video'].includes(x.id))) {
    const n = ok.filter((c) => r.test(c.features!)).length;
    if (n <= Math.floor(t / 4)) out.push({ id: `gap:${r.id}`, statement: `Gap: only ${n} of ${t} pages have ${r.id.replace(/_/g, ' ')} — a chance to stand out`, count: n, total: t, sources: ok.filter((c) => r.test(c.features!)).map((c) => c.url), strength: 0 });
  }
  // common section order (most frequent bigrams)
  const bigrams = new Map<string, string[]>();
  ok.forEach((c) => { const o = c.features!.sectionOrder; for (let i = 0; i < o.length - 1; i++) { const k = `${o[i]} → ${o[i + 1]}`; if (o[i] !== 'content' && o[i + 1] !== 'content') bigrams.set(k, [...new Set([...(bigrams.get(k) || []), c.url])]); } });
  [...bigrams.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 2).filter(([, s]) => s.length >= 2)
    .forEach(([k, s]) => out.push({ id: `order:${k}`, statement: `${s.length} of ${t} pages follow "${k}"`, count: s.length, total: t, sources: s, strength: +(s.length / t).toFixed(2) }));
  return out.sort((a, b) => b.strength - a.strength);
}

/** Merge into category memory (cumulative counts, union of sources). */
export function saveLearnings(category: string, ls: Learning[]) {
  const get = db.prepare('SELECT * FROM learnings WHERE id = ? AND category = ?');
  const up = db.prepare('INSERT OR REPLACE INTO learnings (id, category, statement, count, total, sources_json, updated_at) VALUES (?,?,?,?,?,?,?)');
  for (const l of ls) {
    const prev: any = get.get(l.id, category);
    const count = (prev?.count ?? 0) + l.count, total = (prev?.total ?? 0) + l.total;
    const sources = [...new Set([...l.sources, ...j<string[]>(prev?.sources_json, [])])].slice(0, 30);
    up.run(l.id, category, l.statement, count, total, JSON.stringify(sources), now());
  }
}

export function loadLearnings(category: string, group?: string): Learning[] {
  const rows: any[] = db.prepare('SELECT * FROM learnings WHERE category = ? OR category = ? ORDER BY CAST(count AS REAL)/total DESC').all(category, `group:${group ?? '-'}`);
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).map((r) => ({
    id: r.id, statement: r.statement, count: r.count, total: r.total, sources: j(r.sources_json, []), category: r.category, strength: +(r.count / r.total).toFixed(2),
  }));
}
