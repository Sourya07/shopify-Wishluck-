/**
 * Brand analysis: computed styles from the live product page (Playwright) +
 * a screenshot colour quantisation, fused into an editable Brand object.
 * Every value carries an "evidence" string so the dashboard can explain it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { config } from '../config.js';
import { newContext, politeGoto } from '../lib/browser.js';
import { isOwnStoreHost } from '../lib/polite.js';
import { hexOf, toHex, saturation, dist, isNeutral, luminance, readableOn, ensureContrast, type RGB } from '../lib/color.js';
import { mapToShopifyFont } from '../lib/fonts.js';
import { llmJSON } from '../lib/llm.js';
import type { Brand, Product } from '../types.js';

export function quantize(png: Buffer, maxColors = 8) {
  const img = PNG.sync.read(png);
  const buckets = new Map<string, { sum: RGB; n: number }>();
  let total = 0;
  for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) {
    const i = (img.width * y + x) << 2;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const e = buckets.get(key) ?? { sum: [0, 0, 0] as RGB, n: 0 };
    e.sum[0] += r; e.sum[1] += g; e.sum[2] += b; e.n++; buckets.set(key, e); total++;
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((e) => ({ hex: toHex(e.sum.map((v) => v / e.n) as RGB), n: e.n }));
  const merged: { hex: string; n: number }[] = [];
  for (const c of sorted) { const m = merged.find((x) => dist(x.hex, c.hex) < 38); if (m) m.n += c.n; else merged.push({ ...c }); }
  return merged.sort((a, b) => b.n - a.n).slice(0, maxColors).map((c) => ({ hex: c.hex, share: +(c.n / total).toFixed(3) }));
}

type Probe = Awaited<ReturnType<typeof probePage>>;
async function probePage(page: import('playwright').Page) {
  return page.evaluate(() => {
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const pick = (sels: string[]) => { for (const s of sels) { const el = document.querySelector(s); if (el && (el as HTMLElement).offsetParent !== null) return el; } return null; };
    const body = document.body;
    const h1 = pick(['h1.product__title', '.product__title h1', 'h1[class*="title"]', 'main h1', 'h1']);
    const p = pick(['.product__description p', '.rte p', 'main p', 'p']);
    const atc = pick(['form[action*="/cart/add"] [type="submit"]', 'button[name="add"]', '[class*="add-to-cart"]', '[class*="AddToCart"]', 'button[class*="cart"]']);
    const link = pick(['main a[href]:not([class*="button"])', 'a[href]']);
    const header = pick(['header', '.header', '#shopify-section-header']);
    const announcement = pick(['.announcement-bar', '[class*="announcement"]']);
    const root = getComputedStyle(document.documentElement);
    const vars: Record<string, string> = {};
    for (const v of ['--color-base-accent-1', '--color-base-accent-2', '--color-base-text', '--color-base-background-1', '--color-button', '--color-button-text', '--color-foreground', '--color-background', '--color-primary', '--color-secondary', '--buttons-radius', '--font-heading-family', '--font-body-family']) {
      const val = root.getPropertyValue(v).trim(); if (val) vars[v] = val;
    }
    const s = (el: Element | null, props: string[]) => { const c = cs(el); return c ? Object.fromEntries(props.map((k) => [k, c.getPropertyValue(k)])) : null; };
    // effective background: walk up until non-transparent
    const bgOf = (el: Element | null): string => { let e: Element | null = el; while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; e = e.parentElement; } return 'rgb(255,255,255)'; };
    const sections = [...document.querySelectorAll('main section, main [class*="section"]')].slice(0, 30).map((el) => parseFloat(getComputedStyle(el).paddingTop) || 0);
    return {
      body: s(body, ['color', 'font-family', 'font-size', 'font-weight', 'line-height']), bodyBg: bgOf(body),
      h1: s(h1, ['color', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-transform']),
      p: s(p, ['color', 'font-family', 'font-size', 'font-weight']),
      atc: s(atc, ['background-color', 'color', 'border-radius', 'border-top-width', 'border-top-color', 'font-family', 'text-transform', 'padding-top']),
      atcText: (atc as HTMLElement)?.innerText?.trim().slice(0, 40) ?? null,
      link: s(link, ['color']), header: header ? bgOf(header) : null, announcement: announcement ? bgOf(announcement) : null,
      vars, sectionPadding: sections, imgRadius: s(pick(['.product__media img', 'main img']), ['border-radius']),
      text: (document.querySelector('main') || body).innerText.slice(0, 2500),
      siteName: document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '',
    };
  });
}

function heuristicTone(product: Product, probe: Probe | null, palette: { hex: string; share: number }[]) {
  const t = `${product.title} ${product.descriptionText} ${probe?.text ?? ''}`.toLowerCase();
  const scores: Record<string, number> = { premium: 0, fun: 0, minimal: 0, bold: 0, earthy: 0, techy: 0 };
  if (/luxur|premium|handcraft|crafted|finest|elegan|timeless|exquisite/.test(t)) scores.premium += 2;
  if (product.price > 500000) scores.premium += 1;
  if (/!|fun|vibe|cool|quirky|bro|yay|epic|lit\b|drip/.test(t)) scores.fun += 2;
  if ((t.match(/!/g) || []).length > 4) scores.fun += 1;
  if (/organic|natural|sustain|eco|earth|handmade|cotton|linen/.test(t)) scores.earthy += 1.5;
  if (/battery|bluetooth|mah|anc|ip\d\d|tech|smart/.test(t)) scores.techy += 2;
  const neutralShare = palette.filter((p) => isNeutral(p.hex)).reduce((a, b) => a + b.share, 0);
  if (neutralShare > 0.85) scores.minimal += 2;
  if (palette.some((p) => saturation(p.hex) > 0.6 && p.share > 0.08)) scores.bold += 1.5;
  const tone = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return { tone, notes: `heuristic: ${Object.entries(scores).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(', ') || 'no strong signals, defaulting'}` };
}

export async function analyzeBrand(product: Product, runId: string): Promise<Brand> {
  const evidence: Record<string, string> = {};
  let probe: Probe | null = null; let palette: { hex: string; share: number }[] = []; let shotRel: string | null = null; let shotB64: string | null = null;
  const ctx = await newContext('desktop', { asOwner: isOwnStoreHost(new URL(product.origin).hostname) });
  try {
    const page = await politeGoto(ctx, product.url);
    probe = await probePage(page);
    const buf = await page.screenshot({ type: 'png' });
    palette = quantize(buf);
    const dir = path.join(config.dataDir, 'runs', runId); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'brand.png'), buf); shotRel = `/data/runs/${runId}/brand.png`;
    const small = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1440, height: 900 }, scale: 'css' });
    shotB64 = small.toString('base64');
  } catch (e: any) {
    evidence.warning = `Could not render the page (${e.message}). Colours and fonts below are defaults — please set them by hand before generating.`;
  } finally { await ctx.close(); }

  const vars = probe?.vars ?? {};
  const background = hexOf(probe?.bodyBg) || hexOf(vars['--color-base-background-1']) || '#ffffff';
  const text = hexOf(probe?.body?.color) || hexOf(vars['--color-base-text']) || '#121212';
  evidence.background = probe?.bodyBg ? `computed background of <body>: ${probe.bodyBg}` : 'default';
  evidence.text = probe?.body?.color ? `computed color of <body>: ${probe.body.color}` : 'default';

  let button = hexOf(probe?.atc?.['background-color']);
  const outline = !button || button === background;
  if (outline) button = hexOf(probe?.atc?.['border-top-color']) || hexOf(vars['--color-button']) || text;
  evidence.button = probe?.atc ? `computed style of add-to-cart button "${probe.atcText}": bg ${probe.atc['background-color']}` : 'no ATC button found; fell back to theme vars/text colour';
  const buttonText = hexOf(probe?.atc?.color) && !outline ? hexOf(probe!.atc!.color)! : readableOn(button!);

  // primary: button colour unless it's neutral and the screenshot has a strong brand hue
  const saturated = palette.filter((p) => saturation(p.hex) > 0.35 && luminance(p.hex) > 0.03 && luminance(p.hex) < 0.9 && p.share > 0.004);
  let primary = button!;
  if (isNeutral(button!) && saturated[0]) { primary = saturated[0].hex; evidence.primary = `button is neutral, so primary = most common saturated screenshot colour ${primary} (${(saturated[0].share * 100).toFixed(1)}% of pixels)`; }
  else evidence.primary = `primary = add-to-cart button colour`;
  const secondaryCand = [hexOf(vars['--color-base-accent-2']), hexOf(probe?.announcement), hexOf(probe?.link?.color), ...saturated.map((s) => s.hex), hexOf(probe?.header)]
    .filter((c): c is string => !!c && dist(c, primary) > 60 && dist(c, background) > 40);
  const secondary = secondaryCand[0] || (luminance(primary) > 0.5 ? '#222222' : '#f3f0ea');
  evidence.secondary = secondaryCand[0] ? 'from theme accent / announcement bar / link colour / screenshot' : 'derived (no distinct secondary colour found)';
  const accent = saturated.find((s) => dist(s.hex, primary) > 80)?.hex || secondary;

  const hFam = probe?.h1?.['font-family'] || vars['--font-heading-family'] || 'Assistant, sans-serif';
  const bFam = probe?.body?.['font-family'] || vars['--font-body-family'] || 'Assistant, sans-serif';
  const hW = parseInt(probe?.h1?.['font-weight'] || '700', 10); const bW = parseInt(probe?.body?.['font-weight'] || '400', 10);
  const hm = mapToShopifyFont(hFam, hW), bm = mapToShopifyFont(bFam, bW);
  evidence.headingFont = `h1 computed font-family "${hFam}" ${hW} → ${hm.how}`;
  evidence.bodyFont = `body computed font-family "${bFam}" ${bW} → ${bm.how}`;

  const radius = parseFloat(probe?.atc?.['border-radius'] || vars['--buttons-radius'] || '4') || 0;
  const buttonStyle: Brand['style']['buttonStyle'] = radius >= 20 ? 'pill' : radius >= 3 ? 'rounded' : 'square';
  const pads = (probe?.sectionPadding || []).filter((x) => x > 0); const avgPad = pads.length ? pads.reduce((a, b) => a + b) / pads.length : 36;
  const spacing: Brand['style']['spacing'] = avgPad < 28 ? 'compact' : avgPad > 56 ? 'airy' : 'comfortable';

  // tone + image style: vision LLM when available, heuristic otherwise
  let { tone, notes } = heuristicTone(product, probe, palette); let imageStyle = 'clean product shots on plain background';
  const ai = await llmJSON<{ tone: string; tone_notes: string; image_style: string }>({
    system: 'You are a brand strategist. Analyse an e-commerce product page screenshot and copy. Return JSON {"tone": one of fun|premium|minimal|bold|earthy|techy|playful|classic, "tone_notes": "<=25 words on voice", "image_style": "<=15 words describing photography style"}.',
    user: `Brand: ${product.vendor}\nProduct: ${product.title}\nCopy sample:\n${(probe?.text || product.descriptionText).slice(0, 1500)}`,
    images: shotB64 ? [shotB64] : [],
  }, { runId, vision: true, maxTokens: 300 });
  if (ai?.tone) { tone = ai.tone; notes = ai.tone_notes; imageStyle = ai.image_style || imageStyle; evidence.tone = 'vision LLM on screenshot + copy'; }
  else evidence.tone = notes;

  return {
    brandName: probe?.siteName || product.vendor,
    colors: { primary, secondary, background, text: ensureContrast(text, background), button: button!, buttonText, accent },
    palette,
    fonts: {
      heading: { family: hm.family, weight: hW, sizePx: parseFloat(probe?.h1?.['font-size'] || '32'), shopifyHandle: hm.handle, fallbackStack: hm.fallbackStack },
      body: { family: bm.family, weight: bW, sizePx: parseFloat(probe?.body?.['font-size'] || '16'), shopifyHandle: bm.handle, fallbackStack: bm.fallbackStack },
    },
    style: { tone, toneNotes: notes, imageStyle, buttonStyle, buttonOutline: outline, radius: Math.min(radius, 40), spacing },
    evidence, screenshot: shotRel, confirmed: false,
  };
}
