/**
 * Offline test fixture: a fake Shopify storefront ("Demo Threads") with 5 products
 * across clothing + accessories, Shopify-style .js/.json endpoints, JSON-LD and
 * 10 structurally different "competitor" pages. Lets the whole pipeline run
 * without internet (CI / sandbox). Start: npm run fixtures  (port 4100)
 */
import express from 'express';

const app = express();
const PORT = Number(process.env.FIXTURE_PORT || 4100);
const ORIGIN = `http://localhost:${PORT}`;

const hues: Record<string, [string, string]> = { tee: ['#e8dccb', '#c2410c'], hoodie: ['#d9e2ec', '#1e3a8a'], cargo: ['#e7e5d8', '#4d5d2a'], earrings: ['#f5e6e8', '#b08d57'], backpack: ['#e2e8f0', '#0f172a'] };
app.get('/img/:name/:n.svg', (req, res) => {
  const [bg, fg] = hues[req.params.name] || ['#eee', '#333']; const n = +req.params.n;
  res.type('image/svg+xml').set('cache-control', 'public, max-age=86400').send(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="${bg}"/><circle cx="${300 + n * 90}" cy="${420 + (n % 2) * 80}" r="${230 - n * 18}" fill="${fg}" opacity=".85"/><rect x="180" y="760" width="640" height="40" rx="20" fill="${fg}" opacity=".25"/><text x="500" y="930" font-family="sans-serif" font-size="44" text-anchor="middle" fill="${fg}">${req.params.name} ${n}</text></svg>`);
});

type P = { handle: string; title: string; type: string; price: number; compare: number | null; options: { name: string; values: string[] }[]; desc: string; rating?: [number, number]; reviews?: [string, number, string][]; collection: [string, string]; img: string; tags: string[] };
const PRODUCTS: P[] = [
  { handle: 'heavyweight-oversized-tee', title: 'Heavyweight Oversized Tee', type: 'T-Shirt', price: 99900, compare: 149900, img: 'tee', collection: ['t-shirts', 'T-Shirts'], tags: ['oversized', 'cotton', 'streetwear'],
    options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] }, { name: 'Color', values: ['Black', 'Sand', 'Olive'] }],
    desc: '<p>Cut from 240 GSM combed cotton with dropped shoulders for a relaxed street fit. Pre-shrunk so the size you buy is the size you keep.</p><ul><li>Material: 100% combed cotton</li><li>Fit: Oversized</li><li>Fabric weight: 240 GSM</li><li>Neck: Ribbed crew neck</li><li>Care: Machine wash cold, dry in shade</li><li>Country of origin: India</li></ul>',
    rating: [4.6, 214], reviews: [['Aman S.', 5, 'Thick fabric and the oversized fit is exactly like the photos. Bought a second colour.'], ['Riya K.', 4, 'Great quality, slightly long for my height but I love it.'], ['Kunal', 5, 'Colour has not faded after many washes.']] },
  { handle: 'fleece-zip-hoodie', title: 'Brushed Fleece Zip Hoodie', type: 'Hoodie', price: 189900, compare: null, img: 'hoodie', collection: ['hoodies', 'Hoodies'], tags: ['winter', 'fleece'],
    options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
    desc: '<p>A mid-weight zip hoodie in brushed-back fleece for cold mornings and late flights.</p><table><tr><td>Material</td><td>80% cotton, 20% polyester fleece</td></tr><tr><td>Fit</td><td>Regular</td></tr><tr><td>Closure</td><td>Metal YKK zip</td></tr><tr><td>Pockets</td><td>2 kangaroo pockets</td></tr><tr><td>Care</td><td>Machine wash cold, do not tumble dry</td></tr></table>',
    rating: [4.4, 87], reviews: [['Neha', 5, 'Warm without being bulky. Zip feels solid.'], ['Arjun', 4, 'Runs a little big, size down if between sizes.']] },
  { handle: 'utility-cargo-pants', title: 'Utility Cargo Pants', type: 'Pants', price: 159900, compare: 199900, img: 'cargo', collection: ['bottoms', 'Bottoms'], tags: ['cargo', 'relaxed'],
    options: [{ name: 'Waist', values: ['28', '30', '32', '34', '36'] }, { name: 'Color', values: ['Olive', 'Stone'] }],
    desc: '<p>Relaxed cargo pants with six pockets and an adjustable hem toggle.</p><ul><li>Material: 100% cotton twill</li><li>Fit: Relaxed straight</li><li>Pockets: 6</li><li>Hem: Drawcord toggle</li></ul>' },
  { handle: 'pearl-drop-earrings', title: 'Pearl Drop Earrings', type: 'Earrings', price: 129900, compare: 159900, img: 'earrings', collection: ['earrings', 'Earrings'], tags: ['demi-fine', 'gold plated', 'gift'],
    options: [{ name: 'Finish', values: ['Gold', 'Silver'] }],
    desc: '<p>Freshwater pearl drops on a hypoallergenic 925 sterling silver base, finished in 18k gold plating.</p><ul><li>Base metal: 925 sterling silver</li><li>Plating: 18k gold</li><li>Pearl: Freshwater, 8 mm</li><li>Length: 3.2 cm</li><li>Weight: 4.1 g per pair</li><li>In the box: 1 pair of earrings, pouch, authenticity card</li><li>Care: Keep away from perfume and water</li></ul>',
    rating: [4.8, 342], reviews: [['Sana', 5, 'Looks far more expensive than it is. No irritation even after a full day.'], ['Meera', 5, 'Perfect gift, came in a lovely pouch.'], ['Tanvi', 4, 'Smaller than I expected but very elegant.']] },
  { handle: 'everyday-laptop-backpack', title: 'Everyday Laptop Backpack 22L', type: 'Backpack', price: 279900, compare: null, img: 'backpack', collection: ['bags', 'Bags'], tags: ['laptop', 'travel', 'water resistant'],
    options: [{ name: 'Color', values: ['Charcoal', 'Navy', 'Sage'] }],
    desc: '<p>A 22 litre daily backpack with a padded sleeve that fits laptops up to 16 inches.</p><ul><li>Capacity: 22 L</li><li>Laptop sleeve: Up to 16 inch</li><li>Material: Recycled polyester with water-resistant coating</li><li>Dimensions: 45 x 30 x 15 cm</li><li>Weight: 850 g</li><li>Warranty: 1 year</li></ul>', rating: [4.5, 56], reviews: [['Dev', 5, 'Fits my 16 inch laptop with room for a charger and lunch.']] },
];
const variantsOf = (p: P, pi: number) => {
  const combos = p.options.reduce<string[][]>((acc, o) => acc.flatMap((a) => o.values.map((v) => [...a, v])), [[]]);
  return combos.map((opts, i) => ({ id: 40000000000 + pi * 1000 + i, title: opts.join(' / '), option1: opts[0] ?? null, option2: opts[1] ?? null, option3: null, options: opts, price: p.price, compare_at_price: p.compare, available: (i * 7 + pi) % 6 !== 5, sku: `${p.handle.slice(0, 6).toUpperCase()}-${i}`, featured_image: null }));
};
const imgs = (p: P) => [1, 2, 3, 4, 5].map((n) => `${ORIGIN}/img/${p.img}/${n}.svg`);

app.get('/robots.txt', (_, res) => res.type('text/plain').send('User-agent: *\nDisallow: /checkout\nDisallow: /cart\n'));
app.get('/products/:h.js', (req, res) => {
  const pi = PRODUCTS.findIndex((x) => x.handle === req.params.h); if (pi < 0) return res.sendStatus(404); const p = PRODUCTS[pi];
  const v = variantsOf(p, pi);
  res.json({ id: 9000 + pi, title: p.title, handle: p.handle, description: p.desc, vendor: 'Demo Threads', type: p.type, tags: p.tags, price: p.price, compare_at_price: p.compare, available: v.some((x) => x.available),
    options: p.options.map((o, i) => ({ name: o.name, position: i + 1, values: o.values })), variants: v, images: imgs(p),
    media: imgs(p).map((src, i) => ({ id: 7000 + i, media_type: 'image', src, alt: `${p.title} — view ${i + 1}`, width: 1000, height: 1000 })) });
});
app.get('/products/:h.json', (req, res) => {
  const pi = PRODUCTS.findIndex((x) => x.handle === req.params.h); if (pi < 0) return res.sendStatus(404); const p = PRODUCTS[pi];
  res.json({ product: { id: 9000 + pi, title: p.title, body_html: p.desc, vendor: 'Demo Threads', product_type: p.type, tags: p.tags.join(', '), images: imgs(p).map((src, i) => ({ src, alt: `${p.title} — view ${i + 1}` })) } });
});
app.get('/products/:h', (req, res) => {
  const pi = PRODUCTS.findIndex((x) => x.handle === req.params.h); if (pi < 0) return res.sendStatus(404); const p = PRODUCTS[pi];
  const ld: any = { '@context': 'https://schema.org', '@type': 'Product', name: p.title, offers: { '@type': 'Offer', price: p.price / 100, priceCurrency: 'INR' } };
  if (p.rating) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating[0], reviewCount: p.rating[1] };
  if (p.reviews) ld.review = p.reviews.map(([a, r, b]) => ({ '@type': 'Review', author: { '@type': 'Person', name: a }, reviewRating: { '@type': 'Rating', ratingValue: r }, reviewBody: b }));
  res.send(`<!doctype html><html><head><title>${p.title}</title><meta property="og:site_name" content="Demo Threads"><meta property="og:price:currency" content="INR">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>:root{--color-base-accent-1:194,65,12;--color-base-accent-2:31,41,55;--font-heading-family:"Poppins",sans-serif;--buttons-radius:6px}
body{margin:0;background:#fbf7f1;color:#1f1f1f;font:16px/1.6 "Inter",Arial,sans-serif}header{background:#1f2937;color:#fff;padding:14px 24px}.announcement-bar{background:#c2410c;color:#fff;text-align:center;padding:6px}
main section{padding:48px 24px}h1.product__title{font:700 40px/1.1 "Poppins",sans-serif}.price{font-size:22px}.product-form button[name=add]{background:#c2410c;color:#fff;border:0;border-radius:6px;padding:14px 28px;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:40px}img{width:100%}</style></head><body>
<div class="announcement-bar">Free shipping over ₹999 · Cash on Delivery available</div><header>Demo Threads — <a style="color:#fff" href="/collections/${p.collection[0]}">${p.collection[1]}</a></header>
<main><section class="grid"><div><img src="${imgs(p)[0]}" alt=""></div><div><h1 class="product__title">${p.title}</h1><div class="price">₹${p.price / 100}</div>
<form action="/cart/add" class="product-form"><button type="submit" name="add">Add to cart</button></form>
<p>Delivered in 3-5 business days. Cash on delivery available. 7 day easy returns and exchange.</p><div class="product__description rte">${p.desc}</div></div></section>
<section><h2>Why Demo Threads</h2><p>Designed in Lucknow, made in small batches!</p></section></main></body></html>`);
});
app.get('/search/suggest.json', (_, res) => res.json({ resources: { results: { products: [] } } }));

// ---------- competitor pages: deliberately different structures ----------
const blocks: Record<string, (i: number) => string> = {
  buybox: (i) => `<section class="buy"><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><img src="/img/tee/${(i % 5) + 1}.svg" alt=""><div><h1>${['Relaxed Fit Tee', 'The Softest Tee You Will Ever Own, Made For Hot Indian Summers', 'Why Settle For Thin Tees?', '40% Off Oversized Tees', 'Boxy Tee'][i % 5]}</h1><div class="price">₹799 <s>₹1299</s> 38% off</div>${i % 2 ? '<div class="rating">★★★★☆ 4.3 (120 reviews)</div>' : ''}<form action="/cart/add"><button>Add to cart</button></form>${i % 3 === 0 ? '<p>Cash on delivery available · Delivery by Friday · Easy 7 day returns</p>' : ''}${i % 4 === 1 ? '<input placeholder="Enter pincode">' : ''}</div></div></section>`,
  reviews: () => `<section><h2>Customer reviews</h2><p>4.5 out of 5 · 300 reviews · Verified buyer</p><div class="jdgm-widget">…</div></section>`,
  faq: () => `<section><h2>Frequently asked questions</h2><details><summary>Size?</summary>Fits true</details><details><summary>Fabric?</summary>Cotton</details><details><summary>Returns?</summary>7 days</details></section>`,
  benefits: () => `<section><h2>Why you'll love it</h2><div><svg></svg><svg></svg><svg></svg> Breathable · Pre-shrunk · Colour-fast</div></section>`,
  specs: () => `<section><h2>Specifications</h2><table><tr><td>Material</td><td>Cotton</td></tr><tr><td>Fit</td><td>Oversized</td></tr></table></section>`,
  trust: () => `<section><p>Secure checkout · 100% authentic · Free shipping · Easy returns</p><span class="badge">✓</span></section>`,
  cta: () => `<section><h2>Ready?</h2><button>Add to cart</button></section>`,
  ugc: () => `<section><h2>As seen on Instagram #demotees</h2><img src="/img/tee/1.svg"><img src="/img/tee/2.svg"><img src="/img/tee/3.svg"><img src="/img/tee/4.svg"></section>`,
  offer: () => `<section><h2>Combo offer: buy 2 get 1 free</h2><p>Only 3 left in stock — hurry!</p></section>`,
  recs: () => `<section><h2>You may also like</h2><img src="/img/tee/5.svg"><img src="/img/tee/4.svg"><img src="/img/tee/3.svg"><img src="/img/tee/2.svg"></section>`,
  sticky: () => `<div style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:8px"><button>Add to cart</button></div>`,
  video: () => `<section><h2>See it move</h2><video width="320" height="180"></video></section>`,
};
const LAYOUTS = [
  ['buybox', 'reviews', 'benefits', 'faq', 'recs', 'sticky'], ['buybox', 'trust', 'benefits', 'reviews', 'cta', 'faq', 'sticky'], ['buybox', 'specs', 'reviews', 'faq', 'recs'],
  ['buybox', 'offer', 'trust', 'reviews', 'faq', 'cta', 'sticky'], ['buybox', 'ugc', 'reviews', 'benefits', 'faq', 'recs', 'sticky'], ['buybox', 'benefits', 'specs', 'cta', 'reviews', 'faq'],
  ['buybox', 'video', 'benefits', 'reviews', 'faq', 'cta', 'sticky'], ['buybox', 'trust', 'specs', 'benefits', 'reviews', 'faq', 'recs', 'sticky'], ['buybox', 'reviews', 'ugc', 'offer', 'faq'], ['buybox', 'benefits', 'reviews', 'specs', 'cta', 'faq', 'sticky'],
];
app.get('/comp/:i/products/:h', (req, res) => {
  const i = +req.params.i;
  res.send(`<!doctype html><html><head><title>Competitor ${i}</title><style>body{font-family:sans-serif;margin:0}section{padding:60px 20px;min-height:140px}img{max-width:200px}</style></head><body><main>${LAYOUTS[i % LAYOUTS.length].map((b) => blocks[b](i)).join('')}</main></body></html>`);
});

app.listen(PORT, () => console.log(`fixture store on ${ORIGIN}\n` + PRODUCTS.map((p) => `  ${ORIGIN}/products/${p.handle}`).join('\n')));
export const FIXTURE_PRODUCTS = PRODUCTS.map((p) => `${ORIGIN}/products/${p.handle}`);
export const FIXTURE_COMPETITORS = LAYOUTS.map((_, i) => `${ORIGIN}/comp/${i}/products/tee-${i}`);
