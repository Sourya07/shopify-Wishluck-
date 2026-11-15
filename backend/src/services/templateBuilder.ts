/**
 * Turns a design spec + copy + brand into a Shopify OS 2.0 JSON template
 * (templates/product.<suffix>.json) that references the shared lp-* sections.
 * Every visual decision is written into section settings, so the marketing team
 * can change all of it in the theme editor.
 */
import { contrast, ensureContrast, luminance, mix, readableOn } from '../lib/color.js';
import type { Brand, DesignSpec, Product, SectionKey } from '../types.js';
import type { Copy } from './copywriter.js';

type Pal = { bg: string; text: string; accent: string; button: string; buttonText: string };
const p2 = (t: string) => (t ? (/^<(p|ul|ol)/.test(t.trim()) ? t : `<p>${escapeHtml(t)}</p>`) : '');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function finish(p: Omit<Pal, 'buttonText'> & { buttonText?: string }): Pal {
  const text = ensureContrast(p.text, p.bg, 7);
  const accent = ensureContrast(p.accent, p.bg, 4.5); // used for eyebrow text + icons
  let button = p.button; if (contrast(button, p.bg) < 1.6) button = text;
  const buttonText = p.buttonText && contrast(p.buttonText, button) >= 4.5 ? p.buttonText : readableOn(button);
  return { bg: p.bg, text, accent, button, buttonText };
}

export function palettes(brand: Brand) {
  const { background: bg, text: fg, primary, button, buttonText, secondary } = brand.colors;
  const darkBg = luminance(fg) < 0.06 ? fg : '#151515';
  const lightBtn = isFinite(contrast(button, bg)) && contrast(button, bg) > 1.6 ? button : fg;
  // bold sections keep the brand hue but deepen/lighten it until text clears 7.5:1, so muted text still passes AA
  let boldBg = primary;
  for (let i = 0; i < 14 && contrast(readableOn(boldBg), boldBg) < 7.5; i++) boldBg = mix(boldBg, readableOn(boldBg) === '#ffffff' ? '#000000' : '#ffffff', 0.08);
  const onPrimary = readableOn(boldBg);
  return {
    light: finish({ bg, text: fg, accent: primary, button: lightBtn, buttonText }),
    alt: finish({ bg: mix(bg, fg, 0.045), text: fg, accent: primary, button: lightBtn, buttonText }),
    tint: finish({ bg: mix(bg, primary, 0.1), text: fg, accent: primary, button: lightBtn, buttonText }),
    soft: finish({ bg: mix(bg, secondary, 0.14), text: fg, accent: primary, button: lightBtn, buttonText }),
    dark: finish({ bg: darkBg, text: luminance(bg) > 0.5 ? bg : '#f5f5f5', accent: luminance(primary) > 0.18 ? primary : mix(primary, '#ffffff', 0.5), button: luminance(primary) > 0.18 ? primary : '#ffffff', buttonText: luminance(primary) > 0.18 ? readableOn(primary) : darkBg }),
    bold: finish({ bg: boldBg, text: onPrimary, accent: onPrimary, button: onPrimary, buttonText: boldBg }),
  };
}

function sectionPalette(mode: DesignSpec['colorMode'], key: SectionKey, i: number, P: ReturnType<typeof palettes>): Pal {
  const alternate = i % 2 === 0 ? P.light : P.alt;
  switch (mode) {
    case 'dark': return ['hero', 'story', 'cta', 'trust_bar'].includes(key) ? P.dark : alternate;
    case 'tint': return key === 'hero' ? P.tint : key === 'cta' ? P.bold : i % 2 === 0 ? P.light : P.tint;
    case 'bold': return ['offer', 'cta', 'trust_bar'].includes(key) ? P.bold : key === 'hero' ? P.soft : alternate;
    default: return key === 'cta' ? P.tint : key === 'trust_bar' ? P.alt : alternate;
  }
}

export function buildTemplate(spec: DesignSpec, copy: Copy, brand: Brand, product: Product) {
  const P = palettes(brand);
  const pad = { airy: 88, comfortable: 60, compact: 36 }[spec.density];
  const hscale = { editorial: 120, standard: 100, compact: 90 }[spec.typeScale];
  const radius = brand.style.buttonStyle === 'pill' ? 28 : Math.round(Math.min(brand.style.radius, 24) / 2) * 2;
  const common = (pal: Pal, extra: Record<string, unknown> = {}) => ({
    color_bg: pal.bg, color_text: pal.text, color_accent: pal.accent, color_button: pal.button, color_button_text: pal.buttonText,
    heading_font: brand.fonts.heading.shopifyHandle, body_font: brand.fonts.body.shopifyHandle,
    heading_scale: hscale, radius, padding_top: pad, padding_bottom: pad, ...extra,
  });
  const blocks = (type: string, items: Record<string, unknown>[]) => {
    const b: Record<string, any> = {}; const order: string[] = [];
    items.forEach((settings, i) => { const id = `${type.replace(/[^a-z]/g, '')}_${i + 1}`; b[id] = { type, settings }; order.push(id); });
    return { blocks: b, block_order: order };
  };
  const cap = (t: string) => t.replace(/^./, (x) => x.toUpperCase());
  const trim = (t: string, n = 60) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n)).replace(/[,;:\s]+(and|or)?$/i, ''));
  const deliveryShort = (t: string) => cap(t.match(/deliver(?:ed|y)? (?:in|within) [^.,;]+?days/i)?.[0] || t.match(/(?:dispatch(?:ed)?|ships?) (?:in|within) [^.,;]+?days/i)?.[0] || trim(t));
  const trustItems = [
    product.rating && { icon: 'star', text: `${product.rating.value}/5 from ${product.rating.count} reviews` },
    product.policies.delivery && { icon: 'truck', text: deliveryShort(product.policies.delivery) },
    product.policies.cod && { icon: 'cod', text: /cash on delivery/i.test(product.policies.cod) && product.policies.cod.length < 50 ? product.policies.cod : 'Cash on delivery available' },
    product.policies.returns && { icon: 'return', text: cap(trim(product.policies.returns)) },
    product.policies.shipping && { icon: 'box', text: cap(trim(product.policies.shipping)) },
  ].filter(Boolean) as { icon: string; text: string }[];
  if (trustItems.length < 2) trustItems.push({ icon: 'lock', text: 'Secure checkout' });
  const manyValues = product.options.some((o) => o.values.length > 10);
  const storyLayout = spec.heroType === 'overlay' ? 'image_right' : spec.direction === 'story' ? 'overlay' : spec.direction === 'spec_sheet' ? 'centered' : spec.heroType === 'split_right' ? 'image_left' : 'image_right';
  const sections: Record<string, any> = {};
  const order: string[] = [];
  let i = 0;
  for (const key of spec.sectionOrder) {
    const pal = sectionPalette(spec.colorMode, key, i++, P);
    let s: any;
    switch (key) {
      case 'hero':
        s = { type: 'lp-hero', ...blocks('highlight', copy.hero.highlights.map((text) => ({ text }))), settings: common(pal, {
          layout: spec.heroType, media_ratio: spec.direction === 'story' || spec.direction === 'social_proof' ? '4/5' : spec.heroType === 'stacked' ? '4/3' : '1/1',
          media_fit: 'cover', mobile_media_height: product.options.length > 1 ? 28 : 32, max_media: 6, show_thumbs: spec.heroType !== 'gallery_grid', show_breadcrumb: true,
          eyebrow: copy.hero.eyebrow, heading: '', subheading: p2(copy.hero.subheading), show_rating: true,
          rating_value: product.rating ? String(product.rating.value) : '', rating_count: product.rating ? String(product.rating.count) : '',
          tax_note: product.currency === 'INR' ? 'Inclusive of all taxes' : '', picker: manyValues ? 'dropdown' : 'pills', show_quantity: spec.density !== 'compact',
          atc_label: 'Add to cart', soldout_label: 'Sold out', show_buy_now: false, after_add: 'toast', enable_schema: true,
          padding_top: Math.min(pad, 40),
        }) };
        const tb = blocks('trust', trustItems.slice(0, 4));
        Object.assign(s.blocks, tb.blocks); s.block_order.push(...tb.block_order);
        break;
      case 'trust_bar':
        s = { type: 'lp-trust-bar', ...blocks('item', trustItems.slice(0, 4)), settings: common(pal, { layout: spec.density === 'airy' ? 'boxed' : 'strip', heading: `Why shop with ${brand.brandName}`, padding_top: 20, padding_bottom: 20 }) };
        break;
      case 'story':
        s = { type: 'lp-story', ...blocks('stat', copy.story.stats.slice(0, 3)), settings: common(pal, { layout: storyLayout, show_image: true, product_image: 2, eyebrow: copy.story.eyebrow, heading: copy.story.heading, text: p2(copy.story.text), button_label: spec.direction === 'story' ? 'Shop now' : '', button_outline: true }) };
        break;
      case 'benefits':
        s = { type: 'lp-benefits', ...blocks('benefit', copy.benefits.items.map((b) => ({ icon: b.icon || 'check', title: b.title, text: p2(b.text) }))), settings: common(pal, {
          layout: spec.benefitLayout, columns: Math.min(4, Math.max(2, copy.benefits.items.length === 4 ? 4 : 3)), align: spec.direction === 'spec_sheet' ? 'left' : 'center', product_image: 3,
          heading: copy.benefits.heading, intro: p2(copy.benefits.intro), button_label: '' }) };
        break;
      case 'specs':
        s = { type: 'lp-specs', ...blocks('spec', copy.specs.rows.slice(0, 14).map((r) => ({ label: r.label, value: r.value }))), settings: common(pal, {
          layout: spec.direction === 'benefit_grid' ? 'cards' : 'table', heading: copy.specs.heading, intro: p2(copy.specs.intro),
          for_whom: p2(copy.specs.for_whom), in_box: p2(copy.specs.in_box), care: p2(copy.specs.care) }) };
        break;
      case 'comparison':
        s = { type: 'lp-comparison', ...blocks('row', copy.comparison.rows.map((r) => ({ feature: r.feature, value_a: r.a, value_b: r.b }))), settings: common(pal, {
          heading: copy.comparison.heading, col_a: brand.brandName, col_b: 'Typical alternative', note: 'Based on our published specifications. Alternatives vary by brand.' }) };
        break;
      case 'reviews':
        s = { type: 'lp-reviews', ...blocks('review', product.reviews.slice(0, 6).map((r) => ({ author: r.author, rating: r.rating ?? 0, title: r.title || '', text: p2(r.body), verified: false }))), settings: common(pal, {
          layout: spec.direction === 'social_proof' ? (spec.heroType === 'stacked' ? 'wall' : 'grid') : spec.direction === 'story' ? 'spotlight' : 'carousel',
          heading: copy.reviews.heading, rating_value: product.rating ? String(product.rating.value) : '', rating_count: product.rating ? String(product.rating.count) : '' }) };
        break;
      case 'gallery':
        s = { type: 'lp-gallery', settings: common(pal, { layout: spec.direction === 'social_proof' ? 'mosaic' : spec.direction === 'story' ? 'strip' : 'grid', limit: Math.min(6, product.images.length), heading: copy.gallery.heading }) };
        break;
      case 'offer':
        s = { type: 'lp-offer', ...blocks('perk', copy.offer.perks.map((x) => ({ icon: x.icon, title: x.title, text: x.text.slice(0, 120) }))), settings: common(pal, {
          layout: spec.colorMode === 'bold' ? 'split' : spec.direction === 'offer_led' ? 'banner' : 'timeline', heading: copy.offer.heading, text: p2(copy.offer.text), show_price: true, code: '', button_label: 'Add to cart' }) };
        break;
      case 'faq':
        s = { type: 'lp-faq', ...blocks('faq', copy.faq.items.map((f) => ({ question: f.q, answer: p2(f.a) }))), settings: common(pal, { layout: spec.faqStyle, open_first: true, heading: copy.faq.heading, enable_schema: true }) };
        break;
      case 'cta':
        s = { type: 'lp-cta', settings: common(pal, { layout: { story: 'split', benefit_grid: 'bar', social_proof: 'centered', offer_led: 'centered', spec_sheet: 'bar' }[spec.direction] || 'centered', product_image: 1, heading: copy.cta.heading, text: p2(copy.cta.text), atc_label: 'Add to cart', note: copy.cta.note.slice(0, 80), after_add: 'toast' }) };
        break;
      case 'sticky_atc':
        s = { type: 'lp-sticky-atc', settings: common(P.light, { show_on: 'mobile', show_image: true, atc_label: 'Add to cart', after_add: 'toast', padding_top: 0, padding_bottom: 0 }) };
        break;
      default: continue;
    }
    const id = key === 'sticky_atc' ? 'sticky' : key;
    sections[id] = s; order.push(id);
  }
  return { sections, order };
}
