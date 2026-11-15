/**
 * Shopify Admin GraphQL integration:
 *  - auth: static Admin API token (custom app) or client-credentials (Dev Dashboard app)
 *  - upload lp-* sections/snippets/assets + JSON templates with themeFilesUpsert
 *  - find (or import) the product on the dev store and assign templateSuffix + SEO fields
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let cachedToken: { token: string; exp: number } | null = null;
export const shopifyConfigured = () => !!config.shopify.store && (!!config.shopify.adminToken || (!!config.shopify.clientId && !!config.shopify.clientSecret));

async function token() {
  if (config.shopify.adminToken) return config.shopify.adminToken;
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;
  const r = await fetch(`https://${config.shopify.store}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.shopify.clientId, client_secret: config.shopify.clientSecret }),
  });
  const d: any = await r.json(); if (!r.ok) throw new Error(`Shopify auth failed: ${JSON.stringify(d)}`);
  cachedToken = { token: d.access_token, exp: Date.now() + ((d.expires_in || 3600) - 120) * 1000 };
  return cachedToken.token;
}

export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!shopifyConfigured()) throw new Error('Shopify is not configured (SHOPIFY_STORE + SHOPIFY_ADMIN_TOKEN or client credentials)');
  const r = await fetch(`https://${config.shopify.store}/admin/api/${config.shopify.apiVersion}/graphql.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': await token() }, body: JSON.stringify({ query, variables }),
  });
  const d: any = await r.json();
  if (!r.ok || d.errors) throw new Error(`Shopify API: ${JSON.stringify(d.errors || d).slice(0, 500)}`);
  return d.data;
}

export async function resolveTheme() {
  const d = await gql(`{ themes(first: 30) { nodes { id name role } } }`);
  const themes: { id: string; name: string; role: string }[] = d.themes.nodes;
  if (config.shopify.themeId) {
    const t = themes.find((x) => x.id.endsWith(`/${config.shopify.themeId}`) || x.id === config.shopify.themeId);
    if (!t) throw new Error(`SHOPIFY_THEME_ID ${config.shopify.themeId} not found`);
    if (t.role === 'MAIN' && !config.shopify.allowLiveTheme) throw new Error('Refusing to write to the live theme. Set SHOPIFY_ALLOW_LIVE_THEME=true or use a duplicate/unpublished theme.');
    return t;
  }
  const t = themes.find((x) => /lp builder/i.test(x.name) && x.role !== 'MAIN') || themes.find((x) => x.role === 'UNPUBLISHED') || themes.find((x) => x.role === 'DEVELOPMENT');
  if (t) return t;
  const main = themes.find((x) => x.role === 'MAIN');
  if (main && config.shopify.allowLiveTheme) return main;
  throw new Error('No unpublished theme found. Duplicate your theme in Shopify (Online Store → Themes → … → Duplicate) or set SHOPIFY_THEME_ID.');
}

export function themeFiles() {
  const dir = config.shopifyDir; const files: { filename: string; value: string }[] = [];
  for (const sub of ['sections', 'snippets', 'assets']) {
    for (const f of fs.readdirSync(path.join(dir, sub)).filter((x) => x.startsWith('lp-'))) files.push({ filename: `${sub}/${f}`, value: fs.readFileSync(path.join(dir, sub, f), 'utf8') });
  }
  return files;
}

async function upsert(themeId: string, files: { filename: string; value: string }[]) {
  const errors: string[] = [];
  for (let i = 0; i < files.length; i += 40) {
    const chunk = files.slice(i, i + 40);
    const d = await gql(`mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { field message filename code } } }`,
      { themeId, files: chunk.map((f) => ({ filename: f.filename, body: { type: 'TEXT', value: f.value } })) });
    errors.push(...d.themeFilesUpsert.userErrors.map((e: any) => `${e.filename || ''}: ${e.message}`));
  }
  return errors;
}

export async function findProduct(handle: string) {
  const d = await gql(`query($q: String!) { products(first: 1, query: $q) { nodes { id handle title onlineStoreUrl } } }`, { q: `handle:${handle}` });
  return d.products.nodes[0] as { id: string; handle: string; title: string } | undefined;
}

/** Copy a public product into the dev store (productSet) so its template can be assigned. */
export async function importProduct(p: import('../types.js').Product) {
  const input: any = {
    title: p.title, handle: p.handle, descriptionHtml: p.descriptionHtml, vendor: p.vendor, productType: p.productType, tags: p.tags, status: 'ACTIVE',
    productOptions: p.options.map((o) => ({ name: o.name, values: o.values.map((v) => ({ name: v })) })),
    variants: p.variants.map((v) => ({ optionValues: v.options.map((name, i) => ({ optionName: p.options[i]?.name, name })), price: (v.price / 100).toFixed(2), compareAtPrice: v.compareAtPrice ? (v.compareAtPrice / 100).toFixed(2) : null, inventoryPolicy: 'CONTINUE' })),
    files: p.images.slice(0, 8).map((im) => ({ originalSource: im.src.startsWith('//') ? 'https:' + im.src : im.src, contentType: 'IMAGE', alt: im.alt || p.title })),
  };
  const d = await gql(`mutation($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { id handle } userErrors { field message } } }`, { input });
  if (d.productSet.userErrors.length) throw new Error('productSet: ' + JSON.stringify(d.productSet.userErrors));
  const prod = d.productSet.product;
  try { // publish to Online Store so the storefront URL works
    const pubs = await gql(`{ publications(first: 10) { nodes { id name } } }`);
    const os = pubs.publications.nodes.find((x: any) => /online store/i.test(x.name));
    if (os) await gql(`mutation($id: ID!, $pub: ID!) { publishablePublish(id: $id, input: [{ publicationId: $pub }]) { userErrors { message } } }`, { id: prod.id, pub: os.id });
  } catch (e: any) { console.warn('publish to Online Store failed (needs write_publications):', e.message); }
  return prod as { id: string; handle: string };
}

export type PublishResult = { themeId: string; themeName: string; template: string; productId?: string; productHandle: string; previewUrl: string; editorUrl: string; warnings: string[] };

export async function publishDesign(o: { suffix: string; templateJson: any; product: import('../types.js').Product; assign: boolean; seo?: { title: string; description: string }; importIfMissing: boolean }) {
  const warnings: string[] = [];
  const theme = await resolveTheme();
  const filename = `templates/product.${o.suffix}.json`;
  const tpl = JSON.stringify(o.templateJson, null, 2);
  let errs = await upsert(theme.id, [...themeFiles(), { filename, value: tpl }]);
  if (errs.some((e) => /font/i.test(e))) { // unknown font handle → retry with safe default
    warnings.push(`Shopify rejected a font handle (${errs.join('; ')}); fell back to Assistant.`);
    errs = await upsert(theme.id, [{ filename, value: tpl.replace(/"(heading|body)_font":\s*"[^"]+"/g, '"$1_font": "assistant_n4"') }]);
  }
  if (errs.length) throw new Error('Theme upload errors: ' + errs.join(' | '));
  let prod = await findProduct(o.product.handle);
  if (!prod && o.importIfMissing) { const imp = await importProduct(o.product); prod = { ...imp, title: o.product.title }; warnings.push('Product did not exist on the dev store, so it was imported (title, description, options, variants, images).'); }
  if (prod && o.assign) {
    const input: any = { id: prod.id, templateSuffix: o.suffix };
    if (o.seo) input.seo = { title: o.seo.title, description: o.seo.description };
    const d = await gql(`mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id templateSuffix } userErrors { field message } } }`, { product: input });
    if (d.productUpdate.userErrors.length) warnings.push('Assign failed: ' + JSON.stringify(d.productUpdate.userErrors));
  } else if (!prod) warnings.push('Product not found on the dev store; template uploaded but not assigned.');
  const themeNum = theme.id.split('/').pop();
  const handle = prod?.handle || o.product.handle;
  return {
    themeId: theme.id, themeName: theme.name, template: filename, productId: prod?.id, productHandle: handle,
    previewUrl: `https://${config.shopify.store}/products/${handle}?view=${o.suffix}&preview_theme_id=${themeNum}`,
    editorUrl: `https://${config.shopify.store}/admin/themes/${themeNum}/editor?template=product.${o.suffix}&previewPath=${encodeURIComponent(`/products/${handle}`)}`,
    warnings,
  } as PublishResult;
}
