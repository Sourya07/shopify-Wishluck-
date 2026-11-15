import fs from 'node:fs';
import { planDesigns } from '../services/designEngine.js';
import { writeCopy } from '../services/copywriter.js';
import { buildTemplate } from '../services/templateBuilder.js';
import { renderPage } from '../services/preview.js';
import type { Product, Brand } from '../types.js';

const product: Product = {
  url: 'https://demo.myshopify.com/products/oversized-tee', origin: 'https://demo.myshopify.com', handle: 'oversized-tee', id: 1,
  title: 'Oversized Heavyweight Tee', vendor: 'Demo', productType: 'T-Shirt', tags: ['cotton', 'oversized'], currency: 'INR', price: 99900, compareAtPrice: 149900, available: true,
  options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }, { name: 'Color', values: ['Black', 'Sand'] }],
  variants: ['S', 'M', 'L', 'XL'].flatMap((s, i) => ['Black', 'Sand'].map((c, k) => ({ id: 100 + i * 2 + k, title: `${s} / ${c}`, price: 99900, compareAtPrice: 149900, available: !(s === 'XL' && c === 'Sand'), options: [s, c] }))),
  images: [1, 2, 3, 4].map((i) => ({ src: `https://picsum.photos/seed/tee${i}/1000/1000`, alt: `Tee view ${i}`, width: 1000, height: 1000 })),
  descriptionHtml: '<p>A heavyweight oversized tee cut from 240 GSM combed cotton. Dropped shoulders and a relaxed body give an easy street fit.</p><ul><li>Material: 100% combed cotton</li><li>Fit: Oversized</li><li>GSM: 240</li><li>Care: Machine wash cold</li><li>Neck: Ribbed crew neck</li></ul>',
  descriptionText: 'A heavyweight oversized tee cut from 240 GSM combed cotton. Dropped shoulders and a relaxed body give an easy street fit. Material: 100% combed cotton Fit: Oversized GSM: 240 Care: Machine wash cold',
  specs: [{ label: 'Material', value: '100% combed cotton' }, { label: 'Fit', value: 'Oversized' }, { label: 'GSM', value: '240' }, { label: 'Care', value: 'Machine wash cold' }, { label: 'Neck', value: 'Ribbed crew neck' }],
  rating: { value: 4.6, count: 128 }, reviews: [{ author: 'Aman', rating: 5, body: 'Thick fabric, fits exactly like the size chart says.' }, { author: 'Riya', rating: 4, body: 'Lovely colour, slightly long for me but great quality.' }],
  collection: { handle: 'tees', title: 'T-Shirts' }, policies: { cod: 'Cash on delivery available', returns: '7 day easy returns', delivery: 'Delivered in 3-5 business days', shipping: null }, keywords: ['tee'],
};
const brand: Brand = {
  brandName: 'Demo', colors: { primary: '#d9480f', secondary: '#1b4332', background: '#fbf8f3', text: '#1a1a1a', button: '#1a1a1a', buttonText: '#ffffff', accent: '#d9480f' }, palette: [],
  fonts: { heading: { family: 'Poppins', weight: 700, sizePx: 36, shopifyHandle: 'poppins_n7', fallbackStack: '' }, body: { family: 'Inter', weight: 400, sizePx: 16, shopifyHandle: 'inter_n4', fallbackStack: '' } },
  style: { tone: 'fun', toneNotes: '', imageStyle: '', buttonStyle: 'rounded', buttonOutline: false, radius: 8, spacing: 'comfortable' }, evidence: {},
};
const plan = planDesigns({ product, category: 't-shirts', group: 'clothing', learnings: [], runId: 'smoke', brief: {} });
console.log(plan.designs.map((d) => `${d.name} | ${d.heroType} | ${d.colorMode} | ${d.sectionOrder.join('>')}`));
fs.mkdirSync('/tmp/smoke', { recursive: true });
for (const [i, d] of plan.designs.entries()) {
  const copy = await writeCopy(product, brand, d, {}, 'smoke', 't-shirts');
  const tpl = buildTemplate(d, copy, brand, product);
  const html = await renderPage({ template: tpl, product, brand, meta: { title: copy.seo.metaTitle, description: copy.seo.metaDescription } });
  fs.writeFileSync(`/tmp/smoke/d${i}.html`, html); fs.writeFileSync(`/tmp/smoke/d${i}.json`, JSON.stringify(tpl, null, 2));
}
console.log('ok');
