/**
 * Competitor discovery.
 *  1. Search API (SerpAPI / Brave / Google CSE — whichever key is configured) with
 *     category + keyword queries biased to India ("buy online india", gl=in).
 *  2. Marketplaces, social and our own domain are filtered out; Indian D2C
 *     domains (.in / .co.in / known list / INR pricing) are ranked first.
 *  3. Non-product results on Shopify stores are resolved to a matching product
 *     page via the store's predictive search (/search/suggest.json).
 *  4. Without a search key we fall back to a curated seed list of Indian D2C
 *     Shopify brands per category group (clearly labelled in the reason).
 */
import { config } from '../config.js';
import { politeFetch } from '../lib/polite.js';
import { CATEGORY_QUERY } from './category.js';
import type { Competitor, Product } from '../types.js';

const BLOCK = /amazon\.|flipkart\.|myntra\.|ajio\.|meesho\.|snapdeal\.|tatacliq\.|nykaa(fashion)?\.com|jiomart|pinterest\.|youtube\.|instagram\.|facebook\.|reddit\.|quora\.|wikipedia\.|twitter\.|x\.com|linkedin\.|ebay\.|etsy\.|walmart\.|aliexpress\.|indiamart\.|justdial\.|google\.|bing\.|shopsy\.|limeroad\.|firstcry\.|medium\.com|blogspot\./i;

const INDIAN_D2C = new Set([
  'snitch.com', 'thesouledstore.com', 'bonkerscorner.com', 'powerlook.in', 'rarerabbit.in', 'urbanmonkey.com', 'thebearhouse.com', 'bluorng.com', 'nobero.com',
  'offduty.in', 'almostgods.com', 'fugazee.com', 'bewakoof.com', 'beyoung.in', 'comet.co.in', 'neemans.com', 'gullylabs.com', 'giva.co', 'palmonas.com',
  'salty.co.in', 'mokobara.com', 'nashermiles.com', 'kushals.com', 'isharya.com', 'boat-lifestyle.com', 'gonoise.com', 'boultaudio.com', 'mivi.in', 'fireboltt.com',
  'beminimalist.co', 'dotandkey.com', 'plumgoodness.com', 'mcaffeine.com', 'foxtale.in', 'thedermaco.com', 'bombayshavingcompany.com', 'thesleepcompany.in',
  'chumbak.com', 'nestasia.in', 'ellementry.com', 'sleepyowl.co', 'thewholetruthfoods.com', 'yogabars.in', 'bluetokaicoffee.com', 'bacca-bucci.com', 'damensch.com',
  'xyxxcrew.com', 'jockey.in', 'theman company.com', 'snitch.co.in', 'libas.in', 'thelabellife.com', 'fablestreet.com', 'suta.in', 'bunaai.com', 'zouk.co.in',
]);

const SEEDS: Record<string, string[]> = {
  clothing: ['snitch.com', 'bonkerscorner.com', 'powerlook.in', 'rarerabbit.in', 'urbanmonkey.com', 'thebearhouse.com', 'bluorng.com', 'nobero.com', 'offduty.in', 'almostgods.com', 'fugazee.com', 'damensch.com', 'libas.in', 'suta.in', 'bunaai.com'],
  footwear: ['comet.co.in', 'neemans.com', 'gullylabs.com', 'bacca-bucci.com', 'thesouledstore.com', 'snitch.com', 'urbanmonkey.com', 'rarerabbit.in'],
  accessories: ['giva.co', 'palmonas.com', 'salty.co.in', 'kushals.com', 'isharya.com', 'mokobara.com', 'nashermiles.com', 'zouk.co.in', 'urbanmonkey.com', 'snitch.com'],
  electronics: ['boat-lifestyle.com', 'gonoise.com', 'boultaudio.com', 'mivi.in', 'fireboltt.com'],
  beauty: ['beminimalist.co', 'dotandkey.com', 'plumgoodness.com', 'mcaffeine.com', 'foxtale.in', 'thedermaco.com', 'bombayshavingcompany.com'],
  home: ['thesleepcompany.in', 'chumbak.com', 'nestasia.in', 'ellementry.com'],
  food: ['sleepyowl.co', 'thewholetruthfoods.com', 'yogabars.in', 'bluetokaicoffee.com'],
};

type Hit = { url: string; title: string; snippet?: string; query: string; source: string };
const domainOf = (u: string) => new URL(u).hostname.replace(/^www\./, '');
export const isIndian = (d: string) => INDIAN_D2C.has(d) || /\.in$|\.co\.in$/.test(d);

async function serpapi(q: string): Promise<Hit[]> {
  const u = `https://serpapi.com/search.json?engine=google&gl=${config.search.country}&hl=en&num=20&q=${encodeURIComponent(q)}&api_key=${config.search.serpapiKey}`;
  const d: any = await (await fetch(u, { signal: AbortSignal.timeout(20000) })).json();
  return (d.organic_results || []).map((r: any) => ({ url: r.link, title: r.title, snippet: r.snippet, query: q, source: 'serpapi' }));
}
async function brave(q: string): Promise<Hit[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=20&country=${config.search.country.toUpperCase()}&q=${encodeURIComponent(q)}`, { headers: { 'X-Subscription-Token': config.search.braveKey, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const d: any = await r.json();
  return (d.web?.results || []).map((x: any) => ({ url: x.url, title: x.title, snippet: x.description, query: q, source: 'brave' }));
}
async function google(q: string): Promise<Hit[]> {
  const r = await fetch(`https://www.googleapis.com/customsearch/v1?key=${config.search.googleKey}&cx=${config.search.googleCx}&gl=${config.search.country}&num=10&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(20000) });
  const d: any = await r.json();
  return (d.items || []).map((x: any) => ({ url: x.link, title: x.title, snippet: x.snippet, query: q, source: 'google-cse' }));
}

function provider() {
  const p = config.search.provider; const s = config.search;
  if (p === 'seed') return null;
  if ((p === 'serpapi' || p === 'auto') && s.serpapiKey) return serpapi;
  if ((p === 'brave' || p === 'auto') && s.braveKey) return brave;
  if ((p === 'google' || p === 'auto') && s.googleKey && s.googleCx) return google;
  return null;
}

/** Ask a Shopify store for its best matching product (predictive search API). */
async function resolveProductOnStore(origin: string, terms: string[]): Promise<{ url: string; title: string } | null> {
  for (const q of terms) {
    try {
      const r = await politeFetch(`${origin}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=3`, { headers: { accept: 'application/json' } });
      if (!r.ok) continue;
      const d: any = await r.json();
      const p = d?.resources?.results?.products?.[0];
      if (p?.url) return { url: new URL(p.url.split('?')[0], origin).toString(), title: p.title };
    } catch { /* not shopify or blocked */ }
  }
  return null;
}

export async function findCompetitors(product: Product, category: string, group: string, log: (m: string) => void): Promise<Competitor[]> {
  const own = domainOf(product.origin);
  const base = CATEGORY_QUERY[category] || product.productType || product.keywords.slice(0, 2).join(' ');
  const kw = product.keywords.filter((k) => !base.includes(k)).slice(0, 2).join(' ');
  const terms = [...new Set([`${kw} ${base}`.trim(), base, product.keywords[0]].filter(Boolean))];
  const want = Math.max(8, config.crawl.maxCompetitors);
  const out: Competitor[] = [];
  const seen = new Set<string>([own]);
  const search = provider();

  if (search) {
    const queries = [`${kw} ${base} buy online india`.trim(), `best ${base} brand india`, `${base} ${product.keywords.slice(0, 3).join(' ')} D2C`, `${base} online store india -amazon -flipkart -myntra`];
    log(`Searching (${search.name}) with ${queries.length} queries`);
    const hits: Hit[] = [];
    for (const q of queries) { try { hits.push(...(await search(q))); } catch (e: any) { log(`search failed for "${q}": ${e.message}`); } }
    const ranked = hits
      .filter((h) => { try { return !BLOCK.test(h.url) && !seen.has(domainOf(h.url)); } catch { return false; } })
      .map((h) => ({ h, d: domainOf(h.url), score: (isIndian(domainOf(h.url)) ? 3 : 0) + (/\/products\//.test(h.url) ? 2 : 0) + (/₹|rs\.?\s?\d|inr/i.test(h.snippet || '') ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    for (const { h, d } of ranked) {
      if (out.length >= want) break;
      if (seen.has(d)) continue;
      let url = h.url; let title = h.title; let how = 'direct product page from search';
      if (!/\/products\//.test(url)) {
        const p = await resolveProductOnStore(new URL(url).origin, terms);
        if (p) { url = p.url; title = p.title; how = 'brand found in search, product resolved via store search'; }
        else how = 'landing/collection page from search (not a Shopify product page)';
      }
      seen.add(d);
      out.push({ url, domain: d, title, source: h.source, indianD2C: isIndian(d), status: 'pending',
        reason: `${isIndian(d) ? 'Indian D2C brand; ' : ''}ranked for "${h.query}"; ${how}` });
    }
  }

  if (out.length < 8) {
    const seeds = [...(SEEDS[group] || []), ...Object.values(SEEDS).flat()].filter((d, i, a) => a.indexOf(d) === i && !seen.has(d));
    log(search ? `Only ${out.length} from search, topping up from curated Indian D2C list` : 'No search API key configured: using curated Indian D2C Shopify seed list + store search');
    for (const d of seeds) {
      if (out.length >= want) break;
      const p = await resolveProductOnStore(`https://${d}`, terms);
      if (!p) continue;
      seen.add(d);
      out.push({ url: p.url, domain: d, title: p.title, source: 'seed', indianD2C: true, status: 'pending',
        reason: `Indian D2C Shopify brand in ${SEEDS[group]?.includes(d) ? group : 'an adjacent category'} (curated list); store search matched "${p.title}"` });
    }
  }
  return out;
}
