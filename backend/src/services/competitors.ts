/**
 * Crawl competitor pages (desktop + mobile screenshots, HTML) and extract
 * structural features with DOM heuristics. We only store *patterns* (booleans,
 * section order, counts) — never their copy, images or code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { newContext, politeGoto } from '../lib/browser.js';
import { pLimit } from '../lib/util.js';
import type { Competitor, CompetitorFeatures } from '../types.js';

async function extractFeatures(page: import('playwright').Page, viewportH: number): Promise<CompetitorFeatures & { isShopify: boolean }> {
  const f = await page.evaluate((vh) => {
    const txt = (el: Element) => ((el as HTMLElement).innerText || '').toLowerCase();
    const body = document.body; const all = txt(body);
    const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const absTop = (el: Element) => (el as HTMLElement).getBoundingClientRect().top + window.scrollY;
    const atcRe = /^(add to (cart|bag)|buy (it )?now|add to basket|shop now)/i;
    const atcs = [...document.querySelectorAll('button, a, input[type=submit]')].filter((b) => visible(b) && atcRe.test(((b as HTMLElement).innerText || (b as HTMLInputElement).value || '').trim()));
    const firstAtc = atcs[0];
    const priceEl = [...document.querySelectorAll('[class*="price"]')].find((e) => visible(e) && /₹|rs\.?|\$|€|£|\d/.test(txt(e)));
    const ratingEl = [...document.querySelectorAll('[class*="rating"],[class*="star"],[class*="review"],[class*="jdgm"],[class*="yotpo"],[class*="loox"],[class*="stamped"]')].find(visible);

    // classify top-level blocks of the main content into section types
    const main = document.querySelector('main') || body;
    let blocks = [...main.children].filter((c) => visible(c) && (c as HTMLElement).offsetHeight > 100);
    if (blocks.length < 3) blocks = [...main.querySelectorAll('section, [class*="shopify-section"]')].filter((c) => visible(c) && (c as HTMLElement).offsetHeight > 100);
    const classify = (el: Element) => {
      const t = txt(el).slice(0, 3000); const html = el.innerHTML.toLowerCase();
      if (el.querySelector('form[action*="/cart/add"]') || (priceEl && el.contains(priceEl) && firstAtc && el.contains(firstAtc))) return 'buybox';
      if (/frequently asked|faq|questions/.test(t) || el.querySelectorAll('details').length >= 3) return 'faq';
      if (/customer reviews|ratings? & reviews|what (our )?customers|testimonial|verified buyer|\d+ reviews/.test(t) || /jdgm|yotpo|loox|stamped|judge\.me/.test(html)) return 'reviews';
      if (/you may also like|related products|recommended|complete the look|frequently bought/.test(t)) return 'recommendations';
      if (/compare|comparison| vs\.? /.test(t) && el.querySelector('table, [class*="compar"]')) return 'comparison';
      if (el.querySelector('table') || /specification|product details|material|dimensions|fabric|fit:/.test(t.slice(0, 400))) return 'specs';
      if (el.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]')) return 'video';
      if (/as seen|instagram|#\w+|customer photos|shop the look|community/.test(t)) return 'ugc';
      if (/combo|bundle|buy \d+ get|offer|% off|save ₹|coupon/.test(t.slice(0, 500))) return 'offer';
      if (/our story|why we|crafted|founder|made in|the making/.test(t.slice(0, 500))) return 'story';
      if (/why (choose|you'll love)|features|benefits|key highlights/.test(t.slice(0, 400)) || el.querySelectorAll('svg, img[src*="icon"]').length >= 3) return 'benefits';
      if (/secure|guarantee|certified|warranty|free shipping|easy returns/.test(t.slice(0, 300))) return 'trust';
      if (el.querySelectorAll('img').length >= 4) return 'gallery';
      return 'content';
    };
    const order: string[] = [];
    for (const b of blocks.slice(0, 25)) { const c = classify(b); if (order[order.length - 1] !== c) order.push(c); }

    const h1 = document.querySelector('h1'); const h1t = h1 ? txt(h1).trim() : '';
    const unusual: string[] = [];
    if (document.querySelector('input[placeholder*="incode" i], input[name*="pincode" i], [class*="pincode"]')) unusual.push('pincode delivery checker near the buy box');
    if (document.querySelector('model-viewer, [class*="3d"]')) unusual.push('3D / AR product viewer');
    if (/size (chart|guide)/.test(all) && /recommend|find your size|fit finder/.test(all)) unusual.push('size recommendation tool');
    if (document.querySelector('a[href*="wa.me"], a[href*="whatsapp"], [class*="whatsapp"]')) unusual.push('WhatsApp chat entry point');
    if (/gift ?wrap|gift message/.test(all)) unusual.push('gift wrap option');
    if (/emi|pay in \d|simpl|snapmint|lazypay/.test(all)) unusual.push('EMI / pay-later messaging near price');
    if (/\bquiz\b/.test(all)) unusual.push('product quiz');
    if (document.querySelector('[class*="countdown"], [class*="timer"]')) unusual.push('countdown timer');
    return {
      order, h1t, h1Words: h1t.split(/\s+/).filter(Boolean).length,
      atcCount: atcs.length,
      atcTop: firstAtc ? absTop(firstAtc) : 99999,
      atcTops: atcs.map(absTop),
      priceTop: priceEl ? absTop(priceEl) : null, ratingTop: ratingEl ? absTop(ratingEl) : null,
      compareAt: !!document.querySelector('s, del, [class*="compare"], [class*="was-price"], [class*="price--sale"]'),
      pct: /\d{1,2}\s?% off|save \d{1,2}%/.test(all),
      trust: /secure (checkout|payment)|100% (authentic|original)|certified|trusted by|\bbadge/.test(all) || document.querySelectorAll('[class*="badge"], [class*="trust"]').length > 0,
      guarantee: /guarantee|warranty|money back/.test(all), cod: /cash on delivery|\bcod\b/.test(all),
      returns: /return|exchange/.test(all), delivery: /deliver(y|ed)? (by|in|within)|get it by|estimated delivery|dispatch/.test(all),
      faqCount: Math.max(document.querySelectorAll('details').length, document.querySelectorAll('[class*="faq"] [class*="question"], [class*="accordion"] button').length),
      hasFaq: /frequently asked|faq/.test(all), video: !!document.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]'),
      images: document.querySelectorAll('main img').length, sizeGuide: /size (chart|guide)/.test(all),
      urgency: /only \d+ left|hurry|selling fast|few left|ends in|limited (stock|time)|\d+ (people|others) (are )?(viewing|bought)/.test(all),
      bundle: /combo|bundle|buy \d+ get|pack of \d|buy more save/.test(all),
      specsTable: !!document.querySelector('main table') || /specifications?/.test(all), comparison: /compare|comparison/.test(all),
      ugc: /customer photos|as seen on|#\w+ on instagram|shop the look/.test(all), reviewsSection: /customer reviews|ratings? & reviews|verified (buyer|purchase)/.test(all),
      stars: !!ratingEl, isShopify: !!(window as any).Shopify, unusual,
    };
  }, viewportH);
  // sticky ATC: scroll and see if a fixed/sticky add-to-cart is visible
  await page.evaluate(() => window.scrollTo(0, Math.min(2200, document.body.scrollHeight * 0.6)));
  await page.waitForTimeout(600);
  const sticky = await page.evaluate(() => [...document.querySelectorAll('button, a')].some((b) => {
    const t = ((b as HTMLElement).innerText || '').trim(); if (!/add to (cart|bag)|buy now/i.test(t)) return false;
    const r = b.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight || r.width === 0) return false;
    let e: Element | null = b; while (e) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; e = e.parentElement; } return false;
  }));
  const h1 = f.h1t;
  const headlineStyle: CompetitorFeatures['headlineStyle'] = /\?$/.test(h1) ? 'question' : /off|sale|offer|deal|₹/.test(h1) ? 'offer' : f.h1Words >= 7 ? 'benefit' : h1 ? 'product-name' : 'other';
  const tops = f.atcTops.filter((t: number) => t > 0).sort((a: number, b: number) => a - b);
  return {
    sectionOrder: f.order, headlineStyle, headlineWords: f.h1Words,
    priceShowsCompareAt: f.compareAt, showsDiscountPct: f.pct,
    reviewsNearPrice: f.priceTop != null && f.ratingTop != null && Math.abs(f.ratingTop - f.priceTop) < 220,
    hasReviewsSection: f.order.includes('reviews') || f.reviewsSection, hasRatingStars: f.stars,
    trustBadges: f.trust, guarantee: f.guarantee, codMentioned: f.cod, returnsMentioned: f.returns, deliveryEstimate: f.delivery,
    atcAboveFoldMobile: f.atcTop < viewportH, atcAboveFoldDesktop: f.atcTop < 900, stickyAtcMobile: sticky,
    repeatedAtc: tops.length >= 2 && tops[tops.length - 1] - tops[0] > 1200,
    hasFaq: f.hasFaq || f.order.includes('faq'), faqCount: f.faqCount, hasVideo: f.video, imageCount: f.images, hasSizeGuide: f.sizeGuide,
    urgency: f.urgency, bundleOffer: f.bundle, hasSpecsTable: f.specsTable, hasComparison: f.comparison || f.order.includes('comparison'), ugcImages: f.ugc || f.order.includes('ugc'),
    unusual: f.unusual, isShopify: f.isShopify,
  };
}

export async function analyzeCompetitors(runId: string, comps: Competitor[], log: (m: string, lvl?: 'info' | 'warn') => void, onEach: () => void) {
  const dir = path.join(config.dataDir, 'runs', runId); fs.mkdirSync(dir, { recursive: true });
  const limit = pLimit(config.crawl.concurrency);
  await Promise.all(comps.map((c, i) => limit(async () => {
    const mobile = await newContext('mobile'); const desktop = await newContext('desktop');
    try {
      const mp = await politeGoto(mobile, c.url);
      const vh = mp.viewportSize()?.height ?? 844;
      await mp.screenshot({ path: path.join(dir, `comp-${i}-m.jpg`), type: 'jpeg', quality: 55, fullPage: false });
      const { isShopify, ...features } = await extractFeatures(mp, vh);
      const dp = await politeGoto(desktop, c.url);
      await dp.screenshot({ path: path.join(dir, `comp-${i}-d.jpg`), type: 'jpeg', quality: 55 });
      c.features = features; c.isShopify = isShopify; c.status = 'ok';
      c.screenshots = { mobile: `/data/runs/${runId}/comp-${i}-m.jpg`, desktop: `/data/runs/${runId}/comp-${i}-d.jpg` };
      log(`Analysed ${c.domain}: ${features.sectionOrder.join(' → ')}`);
    } catch (e: any) {
      c.status = /robots|bot protection/i.test(e.message) ? 'blocked' : 'error'; c.error = e.message.slice(0, 200);
      log(`Skipped ${c.domain}: ${c.error}`, 'warn');
    } finally { await mobile.close(); await desktop.close(); onEach(); }
  })));
  return comps;
}
