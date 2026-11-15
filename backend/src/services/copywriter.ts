/**
 * Writes on-brand copy for a design, grounded ONLY in facts from the product page.
 * LLM when configured; deterministic fallback otherwise. Both paths follow the
 * same rules: no invented numbers, reviews or claims; FAQ answers stand alone.
 */
import { db } from '../lib/db.js';
import { llmJSON } from '../lib/llm.js';
import { formatMoney } from './product.js';
import type { Brand, DesignSpec, Product, Spec } from '../types.js';
import type { Brief } from './designEngine.js';

export type Copy = {
  hero: { eyebrow: string; subheading: string; highlights: string[] };
  story: { eyebrow: string; heading: string; text: string; stats: { value: string; label: string }[] };
  benefits: { heading: string; intro: string; items: { icon: string; title: string; text: string }[] };
  specs: { heading: string; intro: string; rows: Spec[]; for_whom: string; in_box: string; care: string };
  comparison: { heading: string; rows: { feature: string; a: string; b: string }[] };
  faq: { heading: string; items: { q: string; a: string }[] };
  offer: { heading: string; text: string; perks: { icon: string; title: string; text: string }[] };
  cta: { heading: string; text: string; note: string };
  gallery: { heading: string };
  reviews: { heading: string };
  seo: { metaTitle: string; metaDescription: string };
};

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25 && s.length < 220);
const findSpec = (p: Product, re: RegExp) => p.specs.find((s) => re.test(s.label))?.value;
const ICONS = ['leaf', 'feather', 'shield', 'sparkle', 'ruler', 'droplet', 'heart', 'bolt', 'sun', 'recycle', 'box', 'clock'];
const iconFor = (t: string) => /cotton|organic|natural|linen|plant/i.test(t) ? 'leaf' : /light|soft|breath|air/i.test(t) ? 'feather' : /durab|strong|warrant|protect/i.test(t) ? 'shield' : /fit|size|length|cut/i.test(t) ? 'ruler' : /water|wash|sweat/i.test(t) ? 'droplet' : /battery|charge|fast|power/i.test(t) ? 'bolt' : /sun|uv|summer/i.test(t) ? 'sun' : /recycl|sustain|eco/i.test(t) ? 'recycle' : 'sparkle';

export function factSheet(p: Product, brand: Brand) {
  return {
    brand: brand.brandName || p.vendor, product: p.title, type: p.productType, price: formatMoney(p.price, p.currency),
    compare_at: p.compareAtPrice ? formatMoney(p.compareAtPrice, p.currency) : null,
    options: p.options.map((o) => `${o.name}: ${o.values.join(', ')}`),
    specs: p.specs, description: p.descriptionText.slice(0, 1800), tags: p.tags.slice(0, 12),
    rating: p.rating, review_count: p.reviews.length, policies: p.policies, collection: p.collection?.title ?? null,
  };
}

function fallback(p: Product, brand: Brand, spec: DesignSpec): Copy {
  const b = brand.brandName || p.vendor;
  const prose = (p.descriptionHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []).map((x) => x.replace(/<[^>]+>/g, ' ')).join(' ').replace(/\s+/g, ' ').trim();
  const sents = sentences(prose || p.descriptionText).filter((x) => !/^[A-Z][\w &/]{1,30}:/.test(x));
  const material = findSpec(p, /material|fabric|composition|base metal/i); const fit = findSpec(p, /fit/i); const care = findSpec(p, /care|wash/i);
  const dims = findSpec(p, /dimension|size|length|weight/i);
  const opt = (n: RegExp) => p.options.find((o) => n.test(o.name));
  const sizes = opt(/size/i)?.values; const colors = opt(/colou?r/i)?.values;
  const highlights = [material && `${material}`, fit && `${fit} fit`, sizes && `Sizes ${sizes[0]}–${sizes[sizes.length - 1]}`, colors && colors.length > 1 && `${colors.length} colours`, ...sents.slice(0, 2).map((s) => s.replace(/\.$/, ''))]
    .filter(Boolean).map(String).slice(0, 3);
  const benefitItems = (p.specs.length >= 3 ? p.specs.slice(0, 4).map((s) => ({ icon: iconFor(s.label + s.value), title: s.label, text: s.value }))
    : sents.slice(0, 4).map((s, i) => ({ icon: iconFor(s), title: s.split(/[,.;:]/)[0].split(' ').slice(0, 5).join(' '), text: s }))).slice(0, 4);
  while (benefitItems.length < 3) benefitItems.push({ icon: ICONS[benefitItems.length], title: ['Made by ' + b, 'Easy to choose', 'Shipped with care'][benefitItems.length], text: [`Designed and sold directly by ${b}.`, `Pick from ${p.variants.length} option${p.variants.length > 1 ? 's' : ''} in the selector above.`, 'Packed and shipped from our warehouse.'][benefitItems.length] });
  const faq: { q: string; a: string }[] = [];
  const T = p.title; const clean = (x: string) => x.replace(/\.$/, '');
  const specBy = (re: RegExp) => p.specs.find((x) => re.test(x.label));
  const mat = specBy(/material|fabric|composition|base metal|metal|plating/i);
  const box = specBy(/in the box|box contents|includes|package/i);
  const dimS = specBy(/dimension|length|width|height|capacity|weight|size/i);
  const warranty = specBy(/warranty|guarantee/i);
  if (sizes) faq.push({ q: `What sizes does the ${T} come in?`, a: `The ${T} is available in sizes ${sizes.join(', ')}.${fit ? ` It has ${/^[aeiou]/i.test(fit) ? 'an' : 'a'} ${fit.toLowerCase()} fit.` : ''} If you are between two sizes, check the size chart on the product page before ordering.` });
  if (mat) faq.push({ q: `What is the ${T} made of?`, a: `The ${T} by ${b} is made with ${mat.value}${p.specs.filter((x) => x !== mat && /plating|pearl|lining|coating|finish/i.test(x.label)).map((x) => `, ${x.label.toLowerCase()}: ${x.value}`).join('')}.` });
  if (dimS && !sizes) faq.push({ q: `How big is the ${T}?`, a: `The ${T} measures as follows — ${p.specs.filter((x) => /dimension|length|width|height|capacity|weight/i.test(x.label)).map((x) => `${x.label.toLowerCase()}: ${x.value}`).join('; ')}.` });
  faq.push({ q: `How long does delivery take for the ${T}?`, a: p.policies.delivery ? `${b} delivers the ${T} as stated on the product page: ${clean(p.policies.delivery)}. The exact date for your pincode is shown at checkout.` : `Delivery timelines for the ${T} depend on your pincode and are shown at checkout before you pay.` });
  faq.push({ q: `Is cash on delivery available for the ${T}?`, a: p.policies.cod ? `Cash on delivery is available for the ${T}, according to ${b}'s product page (“${clean(p.policies.cod)}”). Eligible payment options for your pincode appear at checkout.` : `Payment options for the ${T}, including cash on delivery where ${b} offers it, are shown at checkout for your pincode.` });
  faq.push({ q: `Can I return or exchange the ${T}?`, a: p.policies.returns ? `The ${T} is covered by ${b}'s return policy: ${clean(p.policies.returns)}. Full conditions are on the refund policy page.` : `Returns and exchanges for the ${T} follow ${b}'s refund policy, which is linked in the store footer.` });
  if (care) faq.push({ q: `How do I care for the ${T}?`, a: `To care for the ${T}: ${clean(care)}. Following these instructions keeps it looking new for longer.` });
  if (box) faq.push({ q: `What comes in the box with the ${T}?`, a: `The ${T} package includes ${clean(box.value)}.` });
  if (warranty) faq.push({ q: `Does the ${T} have a warranty?`, a: `The ${T} comes with a ${clean(warranty.value).toLowerCase()} warranty from ${b}.` });
  if (colors && colors.length > 1) faq.push({ q: `Which colours is the ${T} available in?`, a: `The ${T} comes in ${colors.length} colours: ${colors.join(', ')}. Pick your colour in the selector above the add to cart button.` });
  const finishes = p.options.find((o) => !/size|colou?r/i.test(o.name) && o.values.length > 1);
  if (finishes) faq.push({ q: `What ${finishes.name.toLowerCase()} options does the ${T} have?`, a: `The ${T} is available in ${finishes.values.length} ${finishes.name.toLowerCase()} options: ${finishes.values.join(', ')}.` });
  const toneHeadings: Record<string, string[]> = {
    fun: ['Why it slaps', 'The good stuff', 'Questions? We got you'], premium: ['Considered in every detail', 'The details', 'Questions, answered'],
    minimal: ['What matters', 'Specifications', 'FAQ'], default: ['Why you\'ll love it', 'The details', 'Questions, answered'],
  };
  const th = toneHeadings[brand.style.tone] || toneHeadings.default;
  const perks = [
    p.policies.delivery && { icon: 'truck', title: 'Delivery', text: p.policies.delivery },
    p.policies.cod && { icon: 'cod', title: 'Cash on delivery', text: p.policies.cod },
    p.policies.returns && { icon: 'return', title: 'Returns', text: p.policies.returns },
    p.policies.shipping && { icon: 'box', title: 'Shipping', text: p.policies.shipping },
  ].filter(Boolean) as Copy['offer']['perks'];
  if (perks.length < 2) perks.push({ icon: 'lock', title: 'Secure checkout', text: 'Payments are processed by Shopify\'s secure checkout.' }, { icon: 'return', title: 'Refund policy', text: 'Read the full policy at /policies/refund-policy.' });
  return {
    hero: { eyebrow: p.collection?.title || p.productType || b, subheading: sents[0] || `${p.title} by ${b}.`, highlights },
    story: { eyebrow: `About ${b}`, heading: spec.direction === 'story' ? `The story behind the ${p.title}` : `Why ${b} made the ${p.productType || 'product'}`, text: (sents.slice(1, 4).join(' ') || sents[0] || `${p.title} is designed and sold by ${b}.`), stats: p.specs.slice(0, 3).filter((s) => s.value.length < 14).map((s) => ({ value: s.value, label: s.label })) },
    benefits: { heading: th[0], intro: '', items: benefitItems },
    specs: { heading: th[1], intro: `Key facts about the ${p.title} by ${b}.`, rows: p.specs.length ? p.specs : [{ label: 'Brand', value: b }, { label: 'Product type', value: p.productType || '—' }],
      for_whom: p.tags.length ? `${b} lists the ${p.title} under: ${p.tags.slice(0, 4).join(', ')}.` : '', in_box: specBy(/in the box|box contents|includes|package/i)?.value || `1 × ${p.title}`, care: care || '' },
    comparison: { heading: `${b} vs a typical alternative`, rows: p.specs.slice(0, 5).map((s) => ({ feature: s.label, a: s.value, b: 'Varies' })) },
    faq: { heading: th[2], items: faq.slice(0, 8) },
    offer: { heading: p.compareAtPrice ? `Now ${formatMoney(p.price, p.currency)}` : 'Simple, safe ordering', text: '', perks: perks.slice(0, 4) },
    cta: { heading: `Get the ${p.title}`, text: '', note: p.policies.returns || 'Secure checkout' },
    gallery: { heading: 'A closer look' }, reviews: { heading: 'What customers say' },
    seo: { metaTitle: `${p.title} | ${b}`.slice(0, 60), metaDescription: (`Buy the ${p.title} by ${b} at ${formatMoney(p.price, p.currency)}. ` + (sents[0] || '')).slice(0, 155) },
  };
}

function sanitize(c: Copy, base: Copy, p: Product): Copy {
  // never trust model-provided spec rows that aren't in the source facts; keep real ones
  const facts = (p.specs.map((s) => s.value).join(' ') + ' ' + p.descriptionText).toLowerCase();
  const ok = (s: string) => !/\d/.test(s) || (s.match(/\d+(\.\d+)?/g) || []).every((n) => facts.includes(n) || p.options.some((o) => o.values.join(' ').includes(n)) || String(p.price / 100).includes(n));
  const merged: Copy = { ...base, ...c } as Copy;
  merged.specs = { ...base.specs, ...(c.specs || {}), rows: base.specs.rows };
  merged.benefits.items = (c.benefits?.items?.length ? c.benefits.items : base.benefits.items).filter((i) => ok(i.title + ' ' + i.text)).slice(0, 6);
  if (merged.benefits.items.length < 3) merged.benefits.items = base.benefits.items;
  merged.story.stats = base.story.stats; // stats only from real specs
  merged.comparison = base.comparison;
  merged.faq.items = (c.faq?.items?.length ? c.faq.items : base.faq.items).filter((f) => f.q && f.a && ok(f.a)).slice(0, 8);
  if (merged.faq.items.length < 4) merged.faq.items = base.faq.items;
  merged.offer.perks = base.offer.perks; // policies only from real data
  merged.hero.highlights = (c.hero?.highlights || base.hero.highlights).filter(ok).slice(0, 3);
  merged.seo = { metaTitle: (c.seo?.metaTitle || base.seo.metaTitle).slice(0, 60), metaDescription: (c.seo?.metaDescription || base.seo.metaDescription).slice(0, 160) };
  return merged;
}

export async function writeCopy(p: Product, brand: Brand, spec: DesignSpec, brief: Brief, runId: string, category: string): Promise<Copy> {
  const base = fallback(p, brand, spec);
  const prevHeads = (db.prepare(`SELECT content_json FROM designs WHERE category = ? ORDER BY created_at DESC LIMIT 8`).all(category) as any[])
    .map((r) => { try { const c = JSON.parse(r.content_json); return [c.story?.heading, c.benefits?.heading, c.cta?.heading].filter(Boolean).join(' / '); } catch { return ''; } }).filter(Boolean);
  const rejects = (db.prepare(`SELECT reason FROM signals WHERE kind='reject' AND reason IS NOT NULL AND (category = ?) ORDER BY id DESC LIMIT 5`).all(category) as any[]).map((r) => r.reason);
  const ai = await llmJSON<Copy>({
    system: `You write landing-page copy for an Indian D2C Shopify brand. Voice: ${brand.style.tone} (${brand.style.toneNotes}).
Rules: use ONLY facts in FACTS. Never invent numbers, certifications, reviews, ratings, delivery times or discounts. No vague hype ("best in class", "world-class", "revolutionary"). Never invent brand history, founders, origin stories, customer quotes or testimonials; the story section explains the product's purpose and design from the facts only.
Use the brand name "${brand.brandName || p.vendor}" consistently. FAQ answers: 1–3 sentences, direct, each makes sense on its own and repeats the product name. Write in English. Keep it tight: every string under 40 words, story text under 90 words.
Return JSON with keys: hero{eyebrow,subheading,highlights[3]}, story{eyebrow,heading,text}, benefits{heading,intro,items[{icon,title,text}] (3-6; icon one of ${ICONS.join('|')})},
specs{heading,intro,for_whom,in_box,care}, faq{heading,items[{q,a}] (5-7, cover size/fit, material, delivery, COD, returns, care where relevant)}, offer{heading,text}, cta{heading,text,note}, gallery{heading}, reviews{heading}, seo{metaTitle(<=60 chars), metaDescription(<=155 chars)}.`,
    user: `DESIGN DIRECTION: ${spec.name} — ${spec.tagline}. Hero: ${spec.heroType}. Colour mode: ${spec.colorMode}.
${brief.concept ? `CREATIVE CONCEPT FROM USER: ${brief.concept}\n` : ''}${brief.notes ? `USER NOTES: ${brief.notes}\n` : ''}${prevHeads.length ? `AVOID REPEATING THESE PAST HEADINGS: ${prevHeads.join(' | ')}\n` : ''}${rejects.length ? `PAST REJECTION REASONS TO AVOID: ${rejects.join(' | ')}\n` : ''}
FACTS: ${JSON.stringify(factSheet(p, brand))}`,
  }, { runId, maxTokens: 6000 });
  if (!ai) console.warn(`[copy] AI copy unavailable for “${spec.name}”, using template copy`);
  return ai ? sanitize(ai, base, p) : base;
}
