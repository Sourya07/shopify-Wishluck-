/**
 * npm run seed — creates 5 test products (3 clothing, 2 accessories) on your dev store:
 * generated product images (rendered locally with Playwright, uploaded via staged uploads),
 * options + variants, spec lines, compare-at prices, collections, published to the Online Store.
 * Safe to re-run: products whose handle already exists are skipped.
 */
import { chromium } from 'playwright';
import { gql } from '../services/shopify.js';

type P = { handle: string; title: string; type: string; price: number; compare?: number; options: { name: string; values: string[] }[]; desc: string; tags: string[]; collection: string; hue: [string, string]; shape: 'tee' | 'hoodie' | 'pants' | 'earrings' | 'backpack' };
const POLICY = '<p><strong>Shipping &amp; returns:</strong> Dispatched in 1–2 business days and delivered in 3–7 business days. Cash on delivery available. 7-day easy returns and exchanges.</p>';
const PRODUCTS: P[] = [
  { handle: 'heavyweight-oversized-tee', title: 'Heavyweight Oversized Tee', type: 'T-Shirt', price: 999, compare: 1499, collection: 'T-Shirts', tags: ['oversized', 'cotton', 'streetwear'], hue: ['#efe6d8', '#c2410c'], shape: 'tee',
    options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] }, { name: 'Color', values: ['Black', 'Sand', 'Olive'] }],
    desc: '<p>Cut from 240 GSM combed cotton with dropped shoulders for a relaxed street fit. Pre-shrunk so the size you buy is the size you keep.</p><ul><li>Material: 100% combed cotton</li><li>Fit: Oversized</li><li>Fabric weight: 240 GSM</li><li>Neck: Ribbed crew neck</li><li>Care: Machine wash cold, dry in shade</li><li>Country of origin: India</li></ul>' },
  { handle: 'brushed-fleece-zip-hoodie', title: 'Brushed Fleece Zip Hoodie', type: 'Hoodie', price: 1899, collection: 'Hoodies', tags: ['winter', 'fleece'], hue: ['#dde5ee', '#1e3a8a'], shape: 'hoodie',
    options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }, { name: 'Color', values: ['Navy', 'Grey'] }],
    desc: '<p>A mid-weight zip hoodie in brushed-back fleece for cold mornings and late flights.</p><ul><li>Material: 80% cotton, 20% polyester fleece</li><li>Fit: Regular</li><li>Closure: Metal zip</li><li>Pockets: 2 kangaroo pockets</li><li>Care: Machine wash cold, do not tumble dry</li></ul>' },
  { handle: 'utility-cargo-pants', title: 'Utility Cargo Pants', type: 'Pants', price: 1599, compare: 1999, collection: 'Bottoms', tags: ['cargo', 'relaxed'], hue: ['#e7e5d8', '#4d5d2a'], shape: 'pants',
    options: [{ name: 'Waist', values: ['28', '30', '32', '34', '36'] }, { name: 'Color', values: ['Olive', 'Stone'] }],
    desc: '<p>Relaxed cargo pants with six pockets and an adjustable drawcord hem.</p><ul><li>Material: 100% cotton twill</li><li>Fit: Relaxed straight</li><li>Pockets: 6</li><li>Hem: Drawcord toggle</li><li>Care: Machine wash cold, tumble dry low</li></ul>' },
  { handle: 'pearl-drop-earrings', title: 'Pearl Drop Earrings', type: 'Earrings', price: 1299, compare: 1599, collection: 'Earrings', tags: ['demi-fine', 'gold plated', 'gift'], hue: ['#f6e8ea', '#b08d57'], shape: 'earrings',
    options: [{ name: 'Finish', values: ['Gold', 'Silver'] }],
    desc: '<p>Freshwater pearl drops on a hypoallergenic 925 sterling silver base, finished in 18k gold plating.</p><ul><li>Base metal: 925 sterling silver</li><li>Plating: 18k gold</li><li>Pearl: Freshwater, 8 mm</li><li>Length: 3.2 cm</li><li>Weight: 4.1 g per pair</li><li>In the box: 1 pair of earrings, pouch, authenticity card</li><li>Care: Keep away from perfume and water</li></ul>' },
  { handle: 'everyday-laptop-backpack-22l', title: 'Everyday Laptop Backpack 22L', type: 'Backpack', price: 2799, collection: 'Bags', tags: ['laptop', 'travel', 'water resistant'], hue: ['#e3e8ef', '#0f172a'], shape: 'backpack',
    options: [{ name: 'Color', values: ['Charcoal', 'Navy', 'Sage'] }],
    desc: '<p>A 22 litre daily backpack with a padded sleeve that fits laptops up to 16 inches.</p><ul><li>Capacity: 22 L</li><li>Laptop sleeve: Up to 16 inch</li><li>Material: Recycled polyester with water-resistant coating</li><li>Dimensions: 45 x 30 x 15 cm</li><li>Weight: 850 g</li><li>Warranty: 1 year</li></ul>' },
];

const SHAPES: Record<P['shape'], (c: string) => string> = {
  tee: (c) => `<path d="M330 260 L420 215 Q500 250 580 215 L670 260 L740 360 L665 400 L640 365 L640 760 L360 760 L360 365 L335 400 L260 360 Z" fill="${c}"/>`,
  hoodie: (c) => `<path d="M330 290 Q360 200 500 190 Q640 200 670 290 L750 400 L680 440 L655 400 L655 780 L345 780 L345 400 L320 440 L250 400 Z" fill="${c}"/><path d="M430 210 Q500 300 570 210" stroke="#fff" stroke-opacity=".35" stroke-width="10" fill="none"/><line x1="500" y1="300" x2="500" y2="780" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>`,
  pants: (c) => `<path d="M370 220 L630 220 L660 780 L540 780 L500 420 L460 780 L340 780 Z" fill="${c}"/><rect x="350" y="430" width="70" height="90" rx="10" fill="#fff" fill-opacity=".25"/><rect x="580" y="430" width="70" height="90" rx="10" fill="#fff" fill-opacity=".25"/>`,
  earrings: (c) => `<g fill="none" stroke="${c}" stroke-width="10"><path d="M390 300 q-30 40 0 80"/><path d="M610 300 q30 40 0 80"/></g><circle cx="390" cy="470" r="70" fill="#fbf7f2" stroke="${c}" stroke-width="8"/><circle cx="610" cy="470" r="70" fill="#fbf7f2" stroke="${c}" stroke-width="8"/><circle cx="370" cy="450" r="18" fill="#fff"/><circle cx="590" cy="450" r="18" fill="#fff"/>`,
  backpack: (c) => `<rect x="330" y="260" width="340" height="500" rx="70" fill="${c}"/><path d="M420 260 Q420 180 500 180 Q580 180 580 260" stroke="${c}" stroke-width="22" fill="none"/><rect x="380" y="500" width="240" height="180" rx="30" fill="#fff" fill-opacity=".18"/><line x1="400" y1="560" x2="600" y2="560" stroke="#fff" stroke-opacity=".4" stroke-width="6"/>`,
};

function svg(p: P, view: number) {
  const [bg, fg] = p.hue;
  const angles = [0, -8, 6, 0, 0];
  const scale = [1, 0.85, 0.85, 1.25, 0.7][view];
  const extra = view === 3 ? `<circle cx="500" cy="500" r="430" fill="${fg}" opacity=".06"/>` : view === 4 ? `<rect x="120" y="120" width="760" height="760" rx="40" fill="none" stroke="${fg}" stroke-opacity=".15" stroke-width="4"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1000 1000"><defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs><rect width="1000" height="1000" fill="${bg}"/><rect width="1000" height="1000" fill="url(#g)" opacity=".6"/>${extra}<ellipse cx="500" cy="830" rx="260" ry="26" fill="#000" opacity=".08"/><g transform="translate(500 500) rotate(${angles[view]}) scale(${scale}) translate(-500 -500)">${SHAPES[p.shape](fg)}</g></svg>`;
}

async function renderImages(p: P) {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1200, height: 1200 } });
  const out: Buffer[] = [];
  for (let v = 0; v < 5; v++) { await page.setContent(`<html><body style="margin:0">${svg(p, v)}</body></html>`); out.push(await page.screenshot({ type: 'jpeg', quality: 86 })); }
  await b.close(); return out;
}

async function upload(buf: Buffer, filename: string) {
  const d = await gql(`mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } } }`,
    { input: [{ resource: 'IMAGE', filename, mimeType: 'image/jpeg', httpMethod: 'POST', fileSize: String(buf.length) }] });
  const t = d.stagedUploadsCreate.stagedTargets[0];
  if (!t) throw new Error('stagedUploadsCreate: ' + JSON.stringify(d.stagedUploadsCreate.userErrors));
  const form = new FormData();
  for (const prm of t.parameters) form.append(prm.name, prm.value);
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), filename);
  const r = await fetch(t.url, { method: 'POST', body: form });
  if (!r.ok && r.status !== 201 && r.status !== 204) throw new Error(`upload failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return t.resourceUrl as string;
}

const pubs = await gql(`{ publications(first: 10) { nodes { id name } } }`);
const onlineStore = pubs.publications.nodes.find((x: any) => /online store/i.test(x.name));
const collections = new Map<string, string>();
for (const p of PRODUCTS) {
  const exists = await gql(`query($q: String!) { products(first: 1, query: $q) { nodes { id } } }`, { q: `handle:${p.handle}` });
  if (exists.products.nodes[0]) { console.log(`• ${p.title}: already exists, skipped`); continue; }
  process.stdout.write(`• ${p.title}: rendering images… `);
  const imgs = await renderImages(p);
  const urls = []; for (const [i, img] of imgs.entries()) urls.push(await upload(img, `${p.handle}-${i + 1}.jpg`));
  process.stdout.write('uploaded, creating product… ');
  const combos = p.options.reduce<string[][]>((acc, o) => acc.flatMap((a) => o.values.map((v) => [...a, v])), [[]]);
  const input = {
    title: p.title, handle: p.handle, descriptionHtml: p.desc + POLICY, vendor: 'Wishluck LP Builder', productType: p.type, tags: p.tags, status: 'ACTIVE',
    productOptions: p.options.map((o) => ({ name: o.name, values: o.values.map((v) => ({ name: v })) })),
    variants: combos.map((opts) => ({ optionValues: opts.map((name, i) => ({ optionName: p.options[i].name, name })), price: p.price.toFixed(2), compareAtPrice: p.compare ? p.compare.toFixed(2) : null, inventoryPolicy: 'CONTINUE' })),
    files: urls.map((u, i) => ({ originalSource: u, contentType: 'IMAGE', alt: `${p.title} — ${['front view', 'angled view', 'side view', 'detail', 'flat lay'][i]}` })),
  };
  const r = await gql(`mutation($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { id handle onlineStoreUrl } userErrors { field message } } }`, { input });
  if (r.productSet.userErrors.length) { console.log('✘', JSON.stringify(r.productSet.userErrors)); continue; }
  const prod = r.productSet.product;
  if (onlineStore) await gql(`mutation($id: ID!, $pub: ID!) { publishablePublish(id: $id, input: [{ publicationId: $pub }]) { userErrors { message } } }`, { id: prod.id, pub: onlineStore.id });
  let cid = collections.get(p.collection);
  if (!cid) {
    const found = await gql(`query($q: String!) { collections(first: 1, query: $q) { nodes { id } } }`, { q: `title:'${p.collection}'` });
    cid = found.collections.nodes[0]?.id;
    if (!cid) {
      const c = await gql(`mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { message } } }`, { input: { title: p.collection } });
      cid = c.collectionCreate.collection?.id;
      if (cid && onlineStore) await gql(`mutation($id: ID!, $pub: ID!) { publishablePublish(id: $id, input: [{ publicationId: $pub }]) { userErrors { message } } }`, { id: cid, pub: onlineStore.id });
    }
    if (cid) collections.set(p.collection, cid);
  }
  if (cid) await gql(`mutation($id: ID!, $ids: [ID!]!) { collectionAddProducts(id: $id, productIds: $ids) { userErrors { message } } }`, { id: cid, ids: [prod.id] });
  console.log(`✔ /products/${prod.handle}`);
}
console.log('\nDone. Product URLs:');
for (const p of PRODUCTS) console.log(`  https://${process.env.SHOPIFY_STORE}/products/${p.handle}`);
