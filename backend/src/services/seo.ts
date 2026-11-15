/**
 * SEO / AEO / GEO checklist run against the rendered page HTML (local preview or
 * the live storefront). Each check is pass / warn / fail with a fix hint; the
 * score is honest — things we cannot verify locally are marked "manual".
 */
import * as cheerio from 'cheerio';
import type { Product, Brand } from '../types.js';

export type Check = { id: string; group: 'SEO' | 'AEO' | 'GEO'; label: string; status: 'pass' | 'warn' | 'fail' | 'manual'; detail: string };
const VAGUE = /\b(best[- ]in[- ]class|world[- ]class|revolutionary|unmatched|game[- ]changer|like never before|next[- ]level|premium quality|unbeatable|cutting[- ]edge|second to none)\b/gi;

export function runSeoChecks(html: string, product: Product, brand: Brand, publicUrl?: string): { checks: Check[]; score: Record<string, number> } {
  const $ = cheerio.load(html); const checks: Check[] = [];
  const add = (group: Check['group'], id: string, label: string, ok: boolean | 'warn' | 'manual', detail: string) => checks.push({ id, group, label, status: ok === true ? 'pass' : ok === false ? 'fail' : ok, detail });
  const main = $('main');
  // ---------- SEO ----------
  const h1s = $('h1'); add('SEO', 'h1', 'Exactly one H1', h1s.length === 1, `${h1s.length} H1 found${h1s.length ? `: “${h1s.first().text().trim().slice(0, 60)}”` : ''}`);
  const levels = $('h1,h2,h3,h4,h5,h6').map((_, e) => +e.tagName[1]).get(); const skips: string[] = [];
  levels.forEach((l, i) => { if (i && l > levels[i - 1] + 1) skips.push(`h${levels[i - 1]}→h${l}`); });
  add('SEO', 'heading_order', 'Clean heading order (no skipped levels)', skips.length === 0, skips.length ? `Skips: ${[...new Set(skips)].join(', ')}` : `${levels.length} headings in order`);
  const title = $('title').text().trim(); add('SEO', 'meta_title', 'Meta title (≤ 60 chars, includes product)', !!title && title.length <= 60 && title.toLowerCase().includes(product.title.toLowerCase().slice(0, 12)) ? true : title ? 'warn' : false, `${title.length} chars: “${title}”`);
  const desc = $('meta[name=description]').attr('content') || ''; add('SEO', 'meta_desc', 'Meta description (70–160 chars)', desc.length >= 70 && desc.length <= 160 ? true : desc ? 'warn' : false, `${desc.length} chars`);
  const imgs = main.find('img'); const noAlt = imgs.filter((_, e) => { const alt = $(e).attr('alt'); return alt === undefined || (alt.trim() === '' && !$(e).closest('[aria-label], lp-sticky-atc, [aria-hidden="true"]').length); });
  add('SEO', 'alt', 'Alt text on all images', noAlt.length === 0, `${imgs.length - noAlt.length}/${imgs.length} images have alt text (empty alt only on decorative duplicates: thumbnails in labelled buttons, sticky bar)`);
  const canonical = $('link[rel=canonical]').attr('href'); add('SEO', 'canonical', 'Canonical URL', !!canonical, canonical || 'missing');
  add('SEO', 'handle', 'Readable URL handle', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(product.handle) && product.handle.length <= 70, `/products/${product.handle}`);
  const coll = main.find('a[href*="/collections/"]').length + $('header a[href*="/collections/"]').length; add('SEO', 'internal_links', 'Internal link to collection', coll > 0, `${coll} collection link(s)`);
  const ld = $('script[type="application/ld+json"]').map((_, e) => { try { return JSON.parse($(e).text()); } catch { return { __invalid: true }; } }).get();
  const invalid = ld.filter((x) => x.__invalid).length;
  const prod = ld.filter((x) => x['@type'] === 'Product');
  const p = prod[0]; const offers = p ? [].concat(p.offers || []) : [];
  const offerOk = offers.length > 0 && offers.every((o: any) => o.price !== undefined && o.priceCurrency && /schema\.org\/(InStock|OutOfStock|PreOrder)/.test(o.availability));
  add('SEO', 'product_schema', 'Product JSON-LD (name, image, offers with price + availability)', invalid ? false : prod.length === 1 && p.name && p.image?.length && offerOk ? true : prod.length > 1 ? 'warn' : false,
    invalid ? `${invalid} JSON-LD block(s) failed to parse` : prod.length ? `${offers.length} offers, ${p.image?.length || 0} images${prod.length > 1 ? `, ${prod.length} Product blocks (duplicate)` : ''}` : 'missing');
  const hasAgg = !!p?.aggregateRating;
  add('SEO', 'rating_honest', 'Rating in schema only if real', hasAgg ? !!product.rating && Number(p.aggregateRating.ratingValue) === product.rating.value : true,
    hasAgg ? `aggregateRating ${p.aggregateRating.ratingValue} (${p.aggregateRating.reviewCount}) — source page: ${product.rating ? `${product.rating.value} (${product.rating.count})` : 'none'}` : product.rating ? 'rating omitted' : 'no real rating on source page, so none in schema');
  add('SEO', 'rich_results', 'Google Rich Results Test', 'manual', publicUrl ? `Run: https://search.google.com/test/rich-results?url=${encodeURIComponent(publicUrl)}` : 'Publish first, then test the live URL (dev stores need the storefront password removed or use the code-snippet mode).');
  // ---------- AEO ----------
  const faqLd = ld.find((x) => x['@type'] === 'FAQPage'); const qs = faqLd?.mainEntity || [];
  const faqItems = main.find('.lp-faq__item'); add('AEO', 'faq', 'FAQ section with 4+ questions', faqItems.length >= 4 ? true : faqItems.length ? 'warn' : false, `${faqItems.length} questions`);
  add('AEO', 'faq_schema', 'FAQPage schema matches visible FAQs', !!faqLd && qs.length === faqItems.length && qs.every((q: any) => q.name && q.acceptedAnswer?.text), faqLd ? `${qs.length} Q&A in schema` : 'missing');
  const answers: string[] = qs.map((q: any) => String(q.acceptedAnswer?.text || ''));
  const bad = answers.filter((a) => a.length < 40 || a.length > 360 || /^(it|they|this|yes\.?|no\.?)\b/i.test(a.trim()) && !a.toLowerCase().includes(product.title.toLowerCase().split(' ')[0]));
  add('AEO', 'faq_standalone', 'Answers are short and make sense on their own', answers.length > 0 && bad.length === 0 ? true : bad.length <= 1 && answers.length ? 'warn' : false, `${answers.length - bad.length}/${answers.length} answers are 40–360 chars and self-contained`);
  const topics = { 'size/fit': /size|fit|waist|length/i, material: /material|made of|fabric|metal|cotton/i, delivery: /deliver|ship/i, returns: /return|exchange|refund/i, care: /care|wash|clean/i, payment: /cod|cash on delivery|pay/i };
  const qText = qs.map((q: any) => q.name).join(' | ');
  const covered = Object.entries(topics).filter(([, re]) => re.test(qText)).map(([k]) => k);
  add('AEO', 'faq_topics', 'Covers what people search (size, material, delivery, returns, care)', covered.length >= 4 ? true : covered.length >= 3 ? 'warn' : false, `Covered: ${covered.join(', ') || 'none'}`);
  // ---------- GEO ----------
  const specRows = main.find('.lp-specs__table tr').length; add('GEO', 'specs', 'Specs table with 5+ facts', specRows >= 5 ? true : specRows >= 3 ? 'warn' : false, `${specRows} spec rows`);
  const text = main.text().replace(/\s+/g, ' ');
  add('GEO', 'material', 'Material / composition stated', /material|cotton|polyester|silver|gold|leather|steel|fabric|twill|fleece|nylon/i.test(text), 'checked page text');
  add('GEO', 'dimensions', 'Size / dimensions stated', /\b(size|sizes|cm|mm|inch|litre|\bL\b|waist|dimensions|weight)\b/i.test(text), 'checked page text');
  add('GEO', 'audience_box', '“Who it’s for” or “What’s in the box” stated', /who it.?s for|in the box/i.test(text) ? true : 'warn', 'fact cards in specs section');
  const brandName = brand.brandName || product.vendor; const bc = (text.match(new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
  add('GEO', 'brand', 'Brand name used consistently (3+ mentions)', bc >= 3 ? true : bc ? 'warn' : false, `“${brandName}” appears ${bc}×`);
  const vague = text.match(VAGUE) || []; add('GEO', 'no_vague', 'No vague marketing claims without facts', vague.length === 0, vague.length ? `Found: ${[...new Set(vague)].join(', ')}` : 'none found');
  add('GEO', 'price_fact', 'Price and availability visible in text', /₹|\$|€|£|rs\.?\s?\d/i.test(main.find('.lp-price').first().text()), main.find('.lp-price__now').first().text().trim());

  const score: Record<string, number> = {};
  for (const g of ['SEO', 'AEO', 'GEO']) {
    const cs = checks.filter((c) => c.group === g && c.status !== 'manual');
    score[g] = Math.round(100 * cs.reduce((a, c) => a + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) / Math.max(cs.length, 1));
  }
  return { checks, score };
}
