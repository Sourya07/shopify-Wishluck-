/**
 * Local preview renderer. Renders the *same* Liquid section files that get
 * uploaded to Shopify, using liquidjs + mocks of the Shopify objects/filters the
 * sections use. This powers dashboard previews, SEO checks and Lighthouse runs
 * before anything is published.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Liquid, Tag, type TagToken, type TopLevelToken, type Context, type Emitter, type Template } from 'liquidjs';
import { config } from '../config.js';
import { fontByHandle } from '../lib/fonts.js';
import { formatMoney } from './product.js';
import type { Brand, Product } from '../types.js';

const SH = config.shopifyDir;

class Img {
  constructor(public src: string, public alt = '', public width = 1200, public height = 1200) {}
  toString() { return this.src; }
}
class ImgUrl {
  constructor(public url: string, public img?: Img) {}
  toString() { return this.url; }
}
class FontDrop {
  family: string; fallback_families: string; weight: number; style: string; google?: string;
  constructor(public handle: string) {
    const f = fontByHandle(handle || 'assistant_n4');
    this.family = f.family.includes(' ') ? `"${f.family}"` : f.family; this.weight = f.weight; this.style = f.style; this.google = f.google;
    this.fallback_families = /serif/.test(f.cls) ? 'Georgia, serif' : 'system-ui, -apple-system, sans-serif';
  }
  toString() { return this.handle; }
}

const withWidth = (src: string, w: number) => {
  if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(src)) return src;
  const u = new URL(src.startsWith('//') ? 'https:' + src : src); u.searchParams.set('width', String(w)); return u.toString();
};

function productDrop(p: Product) {
  const media = p.images.map((im, i) => ({ id: 1000 + i, media_type: 'image', alt: im.alt, position: i + 1, preview_image: new Img(im.src, im.alt, im.width || 1200, im.height || 1200) }));
  const variants = p.variants.map((v) => ({
    id: v.id, title: v.title, price: v.price, compare_at_price: v.compareAtPrice, available: v.available, options: v.options, sku: v.sku || '',
    url: `/products/${p.handle}?variant=${v.id}`, featured_image: v.imageSrc ? { src: v.imageSrc } : null,
    featured_media: v.imageSrc ? { id: media.find((m) => m.preview_image.src.split('?')[0] === v.imageSrc!.split('?')[0])?.id } : null,
  }));
  const current = variants.find((v) => v.available) || variants[0];
  return {
    id: p.id, title: p.title, handle: p.handle, url: `/products/${p.handle}`, vendor: p.vendor, type: p.productType, description: p.descriptionHtml,
    media, featured_media: media[0] || null, images: media.map((m) => m.preview_image), variants,
    selected_or_first_available_variant: current, has_only_default_variant: variants.length === 1 && /default/i.test(variants[0]?.title || ''),
    options_with_values: p.options.map((o, i) => ({ name: o.name, position: i + 1, values: o.values, selected_value: current?.options[i] })),
    collections: p.collection ? [{ title: p.collection.title, url: `/collections/${p.collection.handle}`, handle: p.collection.handle }] : [],
    metafields: {}, available: p.available,
  };
}

/** {% form 'product', p, id: 'x', class: 'y' %} … {% endform %} */
class FormTag extends Tag {
  private tpls: Template[] = []; private args: string;
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid); this.args = token.args;
    const stream = liquid.parser.parseStream(remain).on('tag:endform', () => stream.stop()).on('template', (t: Template) => this.tpls.push(t)).on('end', () => { throw new Error('form not closed'); });
    stream.start();
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const id = this.args.match(/id:\s*([\w.'"-]+)/)?.[1]; const cls = this.args.match(/class:\s*'([^']+)'/)?.[1] ?? '';
    const idVal = id ? (id.startsWith("'") ? id.slice(1, -1) : String(yield this.liquid.evalValue(id, ctx))) : '';
    emitter.write(`<form method="post" action="/cart/add" id="${idVal}" accept-charset="UTF-8" class="${cls}" enctype="multipart/form-data" novalidate="novalidate"><input type="hidden" name="form_type" value="product"><input type="hidden" name="utf8" value="✓">`);
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</form>');
  }
}
class StyleTag extends Tag {
  private tpls: Template[] = [];
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    const stream = liquid.parser.parseStream(remain).on('tag:endstyle', () => stream.stop()).on('template', (t: Template) => this.tpls.push(t)).on('end', () => { throw new Error('style not closed'); });
    stream.start();
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> { emitter.write('<style>'); yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter); emitter.write('</style>'); }
}
class SchemaTag extends Tag {
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    while (remain.length) { const t: any = remain.shift(); if (t.name === 'endschema') return; }
  }
  render() { return ''; }
}

export function makeEngine(currency: string, fonts: Set<string>) {
  const engine = new Liquid({ root: [path.join(SH, 'snippets')], extname: '.liquid', dynamicPartials: true, strictFilters: false, jsTruthy: false, cache: false });
  engine.registerTag('form', FormTag as any); engine.registerTag('style', StyleTag as any); engine.registerTag('schema', SchemaTag as any);
  const seenCss = new Set<string>();
  engine.registerFilter('money', (c: number) => formatMoney(Number(c) || 0, currency));
  engine.registerFilter('image_url', (img: any, ...args: any[]) => {
    const opts = Object.fromEntries(args.filter(Array.isArray)); const w = Number(opts.width) || 1200;
    const src = img?.src ?? (typeof img === 'string' ? img : img?.preview_image?.src);
    return src ? new ImgUrl(withWidth(src, w), img instanceof Img ? img : undefined) : '';
  });
  engine.registerFilter('image_tag', (u: any, ...args: any[]) => {
    if (!u) return '';
    const o: Record<string, any> = Object.fromEntries(args.filter(Array.isArray));
    const img: Img | undefined = u.img; const url = String(u);
    const w = Number(o.width) || Math.min(img?.width || 1200, Number(new URL(url, 'http://x').searchParams.get('width')) || 1200);
    const h = Number(o.height) || (img ? Math.round(w * img.height / img.width) : w);
    const srcset = o.widths ? String(o.widths).split(',').map((x) => `${withWidth(img?.src || url, +x)} ${x}w`).join(', ') : '';
    const attrs: Record<string, any> = { src: url, alt: o.alt ?? img?.alt ?? '', width: w, height: h, loading: o.loading, class: o.class, sizes: o.sizes, srcset: srcset || undefined, fetchpriority: o.fetchpriority, decoding: 'async' };
    return '<img ' + Object.entries(attrs).filter(([k, v]) => v !== undefined && (v !== '' || k === 'alt')).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ') + '>';
  });
  engine.registerFilter('font_face', (f: any) => { if (f?.google) fonts.add(`${f.google}:${f.weight}`); return ''; });
  engine.registerFilter('font_modify', (f: any) => f);
  engine.registerFilter('json', (v: any) => JSON.stringify(v instanceof FontDrop ? v.handle : v ?? null).replace(/<\//g, '<\\/'));
  engine.registerFilter('asset_url', (n: string) => `/preview-assets/${n}`);
  engine.registerFilter('stylesheet_tag', (u: string) => { if (seenCss.has(u)) return ''; seenCss.add(u); return `<link rel="stylesheet" href="${u}">`; });
  engine.registerFilter('payment_button', () => '');
  engine.registerFilter('placeholder_svg_tag', (_: string, cls: string) => `<svg class="${cls}" viewBox="0 0 400 400" role="img" aria-label="Placeholder image"><rect width="400" height="400" fill="#ddd"/></svg>`);
  engine.registerFilter('floor', (v: number) => Math.floor(Number(v)));
  return engine;
}

export type RenderInput = { template: { sections: Record<string, any>; order: string[] }; product: Product; brand: Brand; meta: { title: string; description: string }; origin?: string };

const schemaCache = new Map<string, any>();
function schemaOf(src: string) {
  if (!schemaCache.has(src)) { try { schemaCache.set(src, JSON.parse(src.match(/{% schema %}([\s\S]*?){% endschema %}/)![1])); } catch { schemaCache.set(src, {}); } }
  return schemaCache.get(src);
}
const defaults = (defs: any[] = []) => Object.fromEntries(defs.filter((d) => d.id && d.default !== undefined).map((d) => [d.id, d.default]));
/** Shopify fills missing settings with schema defaults — mirror that */
function hydrateSettings(type: string, settings: Record<string, any>, src?: string) {
  const out: Record<string, any> = { ...(src ? defaults(schemaOf(src).settings) : {}), ...settings };
  for (const k of ['heading_font', 'body_font']) out[k] = new FontDrop(String(settings[k] || 'assistant_n4'));
  for (const [k, v] of Object.entries(out)) if (v === '') out[k] = '';
  return out;
}

export async function renderPage(input: RenderInput) {
  const { template, product, brand, meta } = input;
  const fonts = new Set<string>();
  const engine = makeEngine(product.currency, fonts);
  const drop = productDrop(product);
  const origin = input.origin || config.publicUrl;
  let body = '';
  for (const id of template.order) {
    const sec = template.sections[id]; if (!sec || sec.disabled) continue;
    const file = path.join(SH, 'sections', `${sec.type}.liquid`);
    const src = fs.readFileSync(file, 'utf8');
    const schema = schemaOf(src);
    const blocks = (sec.block_order || []).map((bid: string) => ({ id: bid, type: sec.blocks[bid].type, settings: { ...defaults(schema.blocks?.find((x: any) => x.type === sec.blocks[bid].type)?.settings), ...sec.blocks[bid].settings }, shopify_attributes: '' }));
    const ctx = {
      section: { id: `template--lp__${id}`, settings: hydrateSettings(sec.type, sec.settings || {}, src), blocks },
      product: drop, cart: { currency: { iso_code: product.currency } }, request: { origin, locale: { iso_code: 'en' }, page_type: 'product' },
      routes: { root_url: '/' }, shop: { name: brand.brandName },
    };
    const html = await engine.parseAndRender(src, ctx);
    body += `<div id="shopify-section-template--lp__${id}" class="shopify-section">${html}</div>\n`;
  }
  const fontLink = fonts.size ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${[...fonts].map((f) => { const [fam, w] = f.split(':'); return `family=${encodeURIComponent(fam)}:wght@${w}`; }).join('&')}&display=swap">` : '';
  const canonical = `${product.origin}/products/${product.handle}`;
  const coll = product.collection ? `<a href="/collections/${product.collection.handle}">${product.collection.title}</a>` : '<a href="/collections/all">Shop all</a>';
  const firstImg = product.images[0]?.src;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)}</title><meta name="description" content="${esc(meta.description)}"><link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}">${firstImg ? `<meta property="og:image" content="${withWidth(firstImg, 1200)}">` : ''}
${firstImg ? `<link rel="preload" as="image" href="${withWidth(firstImg, 900)}" fetchpriority="high">` : ''}${fontLink}
<style>body{margin:0}.pv-header,.pv-footer{font:15px/1.4 system-ui,sans-serif;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 20px;background:${brand.colors.background};color:${brand.colors.text};border-bottom:1px solid rgba(0,0,0,.08)}.pv-header a,.pv-footer a{color:inherit;padding:10px 4px;display:inline-block}.pv-logo{font-weight:700;font-size:18px;text-decoration:none}.pv-footer{border-top:1px solid rgba(0,0,0,.08);border-bottom:0;padding-bottom:110px;flex-wrap:wrap}</style>
</head><body><header class="pv-header"><a class="pv-logo" href="/">${esc(brand.brandName)}</a><nav aria-label="Main">${coll} <a href="/cart">Cart</a></nav></header>
<main id="MainContent">${body}</main>
<footer class="pv-footer"><span>© ${esc(brand.brandName)}</span><nav aria-label="Footer">${coll} <a href="/policies/refund-policy">Refund policy</a> <a href="/policies/shipping-policy">Shipping</a></nav></footer>
<script>window.Shopify={routes:{root:'/'}};</script></body></html>`;
}
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
