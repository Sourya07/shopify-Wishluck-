/** npm run shopify:check — verifies credentials, granted scopes, the target theme and the Online Store channel. */
import { config } from '../config.js';
import { gql, resolveTheme, shopifyConfigured } from '../services/shopify.js';

const need = ['read_themes', 'write_themes', 'read_products', 'write_products', 'read_publications', 'write_publications'];
const ok = (b: boolean, msg: string) => console.log(`${b ? '✔' : '✘'} ${msg}`);

if (!shopifyConfigured()) {
  console.log('✘ Shopify not configured. Set SHOPIFY_STORE and either SHOPIFY_ADMIN_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}
try {
  const d = await gql(`{ shop { name myshopifyDomain plan { displayName } } currentAppInstallation { accessScopes { handle } } themes(first: 30) { nodes { id name role } } publications(first: 10) { nodes { name } } }`);
  ok(true, `Connected to ${d.shop.name} (${d.shop.myshopifyDomain}, ${d.shop.plan?.displayName ?? 'dev'}) · API ${config.shopify.apiVersion}`);
  const scopes: string[] = d.currentAppInstallation.accessScopes.map((s: any) => s.handle);
  const missing = need.filter((s) => !scopes.includes(s));
  ok(!missing.length, missing.length ? `Missing scopes: ${missing.join(', ')} — add them to the app version and reinstall` : `Scopes OK (${scopes.join(', ')})`);
  for (const t of d.themes.nodes) console.log(`   theme: ${t.name} · ${t.role} · ${t.id.split('/').pop()}`);
  try { const t = await resolveTheme(); ok(true, `Will publish into: ${t.name} (${t.role}, id ${t.id.split('/').pop()})`); }
  catch (e: any) { ok(false, e.message); }
  const os = d.publications.nodes.some((p: any) => /online store/i.test(p.name));
  ok(os, os ? 'Online Store channel found (imported/seeded products can be published)' : 'Online Store channel not visible to the app');
} catch (e: any) {
  ok(false, e.message);
  console.log('  Tip: for Dev Dashboard apps, the app must be installed on this store and SHOPIFY_CLIENT_SECRET must match the app.');
  process.exit(1);
}
