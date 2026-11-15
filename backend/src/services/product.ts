/**
 * Product extraction. Shopify exposes structured product data at
 * /products/<handle>.js (prices in cents, variant IDs) and .json (type, tags,
 * image alt). We merge that with the rendered HTML for rating/reviews (only
 * when present in JSON-LD / microdata), collection links, and policy text.
 */
import * as cheerio from 'cheerio';
import { politeFetch } from '../lib/polite.js';
import { stripHtml } from '../lib/util.js';
import { config } from '../config.js';
import { gql, shopifyConfigured } from './shopify.js';
import type { Product, Spec, Review } from '../types.js';

export function parseProductUrl(raw: string) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Paste a Shopify product URL, e.g. https://your-store.com/products/your-product');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s; // allow "store.com/products/x"
  let u: URL;
  try { u = new URL(s); } catch { throw new Error('That is not a valid URL. Paste the full product link, e.g. https://your-store.com/products/your-product'); }
  // works for /products/x, /collections/y/products/x and ?variant=… links
  const m = u.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) throw new Error('Only Shopify product pages are supported — the link must contain /products/<handle> (e.g. https://your-store.com/products/your-product).');
  return { origin: u.origin, handle: decodeURIComponent(m[1]), url: `${u.origin}/products/${m[1]}` };
}

async function getJson(url: string) {
  const r = await politeFetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`got ${r.status} ${r.headers.get('content-type') || 'unknown type'} instead of JSON (ended at ${new URL(r.url).pathname})`); }
}

/** Shopify exposes /products/<handle>.js on every storefront (custom domains included); anything else isn't supported. */
async function getShopifyProductJs(url: string) {
  let js: any;
  try { js = await getJson(`${url}.js`); }
  catch (e: any) {
    if (/robots/i.test(e.message)) throw new Error('This store blocks automated access in robots.txt, so it can’t be analysed.');
    if (/^404/.test(e.message)) throw new Error('Product not found on this store (404). Check the handle in the URL, or make sure the product is published to the Online Store.');
    if (/password|401|403/i.test(e.message)) throw new Error('The storefront is password-protected. Add the store’s storefront password to SHOPIFY_STOREFRONT_PASSWORD in .env (Online Store → Preferences shows it on dev stores), then restart.');
    throw new Error(`This doesn’t look like a Shopify product page — ${url}.js did not return Shopify product data (${e.message.slice(0, 140)}). Only Shopify product URLs are supported.`);
  }
  if (!js || !Array.isArray(js.variants) || !js.variants.length || !js.title) throw new Error('This doesn’t look like a Shopify product page (no Shopify product data found). Only Shopify product URLs are supported.');
  return js;
}

export function extractSpecs(html: string): Spec[] {
  const $ = cheerio.load(html || '');
  const specs: Spec[] = [];
  const push = (label: string, value: string) => {
    label = label.replace(/[:\-–]+$/, '').trim(); value = value.trim();
    if (label && value && label.length < 40 && value.length < 200 && !specs.some((s) => s.label.toLowerCase() === label.toLowerCase())) specs.push({ label, value });
  };
  $('tr').each((_, tr) => { const c = $(tr).find('td,th'); if (c.length >= 2) push($(c[0]).text(), $(c[1]).text()); });
  const lines: string[] = [];
  $('li,p,div,span').each((_, el) => { if (!$(el).children('li,p,div').length) lines.push($(el).text()); });
  for (const raw of [...lines, ...stripHtml(html).split(/(?<=\.)\s+|\n/)]) {
    const m = raw.trim().match(/^([A-Z][A-Za-z &/()]{1,34})\s*:\s*(.{1,180})$/);
    if (m) push(m[1], m[2]);
  }
  return specs.slice(0, 20);
}

const flatten = (x: any): any[] => (Array.isArray(x) ? x.flatMap(flatten) : x && x['@graph'] ? flatten(x['@graph']) : x ? [x] : []);

function readJsonLd($: cheerio.CheerioAPI) {
  const nodes: any[] = [];
  $('script[type="application/ld+json"]').each((_, s) => { try { nodes.push(...flatten(JSON.parse($(s).text()))); } catch { /* ignore */ } });
  return nodes;
}

/** search policy phrases inside individual leaf elements, so we never glue unrelated text together */
function findPolicy(chunks: string[], re: RegExp) {
  for (const c of chunks) {
    const m = c.match(re);
    if (m) { let end = (m.index ?? 0) + m[0].length; while (end < c.length && /[\w–-]/.test(c[end])) end++; m[0] = c.slice(m.index ?? 0, end); }
    if (m) return m[0].replace(/\s+/g, ' ').replace(/^[^:]{0,30}:\s*/, '').replace(/^[\s·•|,-]+|[\s·•|,-]+$/g, '').trim().replace(/^./, (x) => x.toUpperCase()).slice(0, 140);
  }
  return null;
}

const STOP = new Set('the and for with your you our from this that are men women unisex new pack of in on to a an by is'.split(' '));
export function keywordsFor(p: Pick<Product, 'title' | 'productType' | 'tags' | 'vendor'>) {
  const words = `${p.productType} ${p.title}`.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && w !== p.vendor.toLowerCase());
  return [...new Set([...words, ...p.tags.map((t) => t.toLowerCase()).filter((t) => t.length < 24)])].slice(0, 12);
}

const isOwnStore = (host: string) => !!config.shopify.store && host.replace(/^www\./, '') === config.shopify.store.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Our own (connected) store: read the product through the Admin API — works even behind the storefront password. */
async function extractViaAdmin(origin: string, handle: string, url: string): Promise<Product | null> {
  const d = await gql(`query($q: String!) { shop { currencyCode name }
    products(first: 1, query: $q) { nodes { id legacyResourceId handle title vendor productType tags descriptionHtml status
      options { name optionValues { name } }
      variants(first: 100) { nodes { legacyResourceId title price compareAtPrice availableForSale sku selectedOptions { name value } image { url } } }
      media(first: 12) { nodes { ... on MediaImage { image { url altText width height } } } }
      collections(first: 10) { nodes { handle title } }
      rating: metafield(namespace: "reviews", key: "rating") { value }
      ratingCount: metafield(namespace: "reviews", key: "rating_count") { value } } } }`, { q: `handle:${handle}` });
  const n = d.products.nodes[0]; if (!n) return null;
  const cents = (v: any) => (v == null || v === '' ? null : Math.round(parseFloat(typeof v === 'object' ? v.amount : v) * 100));
  const variants = n.variants.nodes.map((v: any) => ({ id: Number(v.legacyResourceId), title: v.title, price: cents(v.price) ?? 0, compareAtPrice: cents(v.compareAtPrice), available: !!v.availableForSale,
    options: v.selectedOptions.map((o: any) => o.value), sku: v.sku, imageSrc: v.image?.url ?? null }));
  let rating: Product['rating'] = null;
  try { const rv = JSON.parse(n.rating?.value || 'null'); const rc = Number(n.ratingCount?.value); if (rv && Number(rv.value) > 0 && rc > 0) rating = { value: +Number(rv.value).toFixed(1), count: rc }; } catch { /* no rating */ }
  const descText = stripHtml(n.descriptionHtml || '');
  // split on block elements first so list items / paragraphs never run together
  const chunks = (n.descriptionHtml || '').split(/<\/(?:p|li|h\d|div|td)>|<br\s*\/?>/i).map((t: string) => stripHtml(t)).filter(Boolean).flatMap((t: string) => t.split(/(?<=[.!])\s+/));
  const prices = variants.map((v: any) => v.price); const minIdx = prices.indexOf(Math.min(...prices));
  const product: Product = {
    url, origin, handle: n.handle, id: Number(n.legacyResourceId), title: n.title, vendor: n.vendor || d.shop.name, productType: n.productType || '', tags: n.tags || [],
    currency: d.shop.currencyCode || 'INR', price: variants[minIdx]?.price ?? 0, compareAtPrice: variants[minIdx]?.compareAtPrice ?? null, available: variants.some((v: any) => v.available),
    options: n.options.map((o: any) => ({ name: o.name, values: o.optionValues.map((x: any) => x.name) })),
    variants, images: n.media.nodes.filter((m: any) => m.image).map((m: any) => ({ src: m.image.url, alt: m.image.altText || '', width: m.image.width, height: m.image.height })),
    descriptionHtml: n.descriptionHtml || '', descriptionText: descText, specs: extractSpecs(n.descriptionHtml || ''),
    rating, reviews: [], collection: (() => { const c = n.collections.nodes.find((x: any) => !/^(frontpage|home-page|all)$/i.test(x.handle) && !/^home ?page$/i.test(x.title)); return c ? { handle: c.handle, title: c.title } : null; })(),
    policies: {
      cod: findPolicy(chunks, /[^.]{0,40}\b(cash on delivery|COD)\b[^.]{0,40}/i),
      returns: findPolicy(chunks, /[^.]{0,40}\b(\d{1,2}[- ]day[s]? (easy )?(return|exchange)s?|easy (returns|exchange)s?|free returns?)\b[^.]{0,40}/i),
      delivery: findPolicy(chunks, /[^.]{0,40}\b(deliver(y|ed) (in|within) \d+[-–]?\d* (business |working )?days|ships? (in|within) \d+[-–]?\d* days|dispatch(ed)? (in|within) \d+[-–]?\d* ?\w*)\b[^.]{0,30}/i),
      shipping: findPolicy(chunks, /[^.]{0,30}\bfree (shipping|delivery)\b[^.]{0,50}/i),
    },
    keywords: [],
  };
  if (n.status !== 'ACTIVE') console.warn(`[product] ${n.handle} is ${n.status} — it will not show on the storefront`);
  product.keywords = keywordsFor(product);
  return product;
}

export async function extractProduct(rawUrl: string): Promise<Product> {
  const { origin, handle, url } = parseProductUrl(rawUrl);
  if (isOwnStore(new URL(origin).host) && shopifyConfigured()) {
    try { const p = await extractViaAdmin(origin, handle, url); if (p) return p; throw new Error(`Product “${handle}” not found on ${config.shopify.store}. Check the handle in the URL.`); }
    catch (e: any) { if (/not found on/.test(e.message)) throw e; console.warn('[product] Admin API read failed, falling back to storefront:', e.message); }
  }
  const [js, jsonWrap, htmlRes] = await Promise.all([
    getShopifyProductJs(url),
    getJson(`${url}.json`).catch(() => null),
    politeFetch(url).then((r) => r.text()).catch(() => ''),
  ]);
  const pj = jsonWrap?.product ?? {};
  const $ = cheerio.load(htmlRes || '');
  const ld = readJsonLd($);
  const ldProduct = ld.find((n) => [].concat(n['@type']).includes('Product' as never));
  const chunks: string[] = [];
  $('body').find('p,li,span,div,small,td').each((_, el) => { if (!$(el).children('p,li,div,ul,table').length) { const t = $(el).text().replace(/\s+/g, ' ').trim(); if (t && t.length < 300) chunks.push(...t.split(/(?<=[.!])\s+|\s[·|•]\s/)); } });

  // currency: storefront JS > og meta > JSON-LD
  const currency =
    htmlRes.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ||
    $('meta[property="og:price:currency"]').attr('content') ||
    [].concat(ldProduct?.offers ?? []).map((o: any) => o?.priceCurrency).find(Boolean) || 'INR';

  // rating & reviews: only what the page actually exposes
  let rating: Product['rating'] = null;
  const agg = ldProduct?.aggregateRating;
  if (agg && Number(agg.ratingValue) > 0 && Number(agg.reviewCount ?? agg.ratingCount) > 0) {
    rating = { value: +Number(agg.ratingValue).toFixed(1), count: Number(agg.reviewCount ?? agg.ratingCount) };
  } else {
    const rv = $('[itemprop="ratingValue"]').first().attr('content') || $('[itemprop="ratingValue"]').first().text();
    const rc = $('[itemprop="reviewCount"],[itemprop="ratingCount"]').first().attr('content') || $('[itemprop="reviewCount"]').first().text();
    if (Number(rv) > 0 && Number(rc) > 0) rating = { value: +Number(rv).toFixed(1), count: Number(rc) };
  }
  const reviews: Review[] = [].concat(ldProduct?.review ?? []).slice(0, 8).map((r: any) => ({
    author: (typeof r.author === 'string' ? r.author : r.author?.name) || 'Verified buyer',
    rating: Number(r.reviewRating?.ratingValue) || null,
    body: stripHtml(String(r.reviewBody || r.description || '')).slice(0, 400),
    title: r.name,
  })).filter((r) => r.body.length > 10);

  // collection for internal linking
  let collection: Product['collection'] = null;
  $('a[href*="/collections/"]').each((_, a) => {
    if (collection) return;
    const href = $(a).attr('href') || ''; const m = href.match(/\/collections\/([^/?#]+)/);
    const title = $(a).text().trim();
    if (m && !['all', 'frontpage', 'home-page'].includes(m[1]) && title && title.length < 40 && !/^home ?page$/i.test(title) && !href.includes('/products/')) collection = { handle: m[1], title };
  });

  const variants = (js.variants || []).map((v: any) => ({
    id: v.id, title: v.title, price: v.price, compareAtPrice: v.compare_at_price || null, available: !!v.available,
    options: v.options || [v.option1, v.option2, v.option3].filter(Boolean), sku: v.sku, imageSrc: v.featured_image?.src ?? null,
  }));
  const altBySrc = new Map<string, string>((pj.images || []).map((i: any) => [String(i.src).split('?')[0], i.alt || '']));
  const images = (js.media?.length ? js.media.filter((m: any) => m.media_type === 'image').map((m: any) => ({ src: m.src, alt: m.alt, width: m.width, height: m.height })) : (js.images || []).map((s: string) => ({ src: s })))
    .map((i: any) => ({ src: String(i.src).startsWith('//') ? 'https:' + i.src : i.src, alt: i.alt || altBySrc.get(String(i.src).split('?')[0]) || '', width: i.width, height: i.height }));

  const descriptionHtml: string = js.description || pj.body_html || '';
  const product: Product = {
    url, origin, handle, id: js.id ?? null,
    title: js.title, vendor: js.vendor || pj.vendor || new URL(origin).hostname.replace(/^www\./, '').split('.')[0],
    productType: js.type || pj.product_type || '',
    tags: Array.isArray(js.tags) ? js.tags : String(pj.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
    currency, price: js.price, compareAtPrice: js.compare_at_price || null, available: !!js.available,
    options: (js.options || []).map((o: any) => (typeof o === 'string' ? { name: o, values: [] } : { name: o.name, values: o.values })),
    variants, images, descriptionHtml, descriptionText: stripHtml(descriptionHtml), specs: extractSpecs(descriptionHtml),
    rating, reviews, collection,
    policies: {
      cod: findPolicy(chunks, /[^.]{0,40}\b(cash on delivery|COD)\b[^.]{0,40}/i),
      returns: findPolicy(chunks, /[^.]{0,40}\b(\d{1,2}[- ]day[s]? (easy )?(return|exchange)s?|easy (returns|exchange)s?|free returns?)\b[^.]{0,40}/i),
      delivery: findPolicy(chunks, /[^.]{0,40}\b(deliver(y|ed) (in|within) \d+[-–]?\d* (business |working )?days|ships? (in|within) \d+[-–]?\d* days|dispatch(ed)? (in|within) \d+ ?\w*)\b[^.]{0,30}/i),
      shipping: findPolicy(chunks, /[^.]{0,30}\bfree (shipping|delivery)\b[^.]{0,50}/i),
    },
    keywords: [],
  };
  product.keywords = keywordsFor(product);
  return product;
}

export function formatMoney(cents: number, currency: string) {
  try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); }
  catch { return `${currency} ${(cents / 100).toFixed(2)}`; }
}
