/**
 * End-to-end test + results report.
 *   npm test                      → offline: fixture store, 5 products (clothing + accessories)
 *   npm test -- <url> <url> …     → real public Shopify product URLs (needs internet; uses your .env keys)
 * For each product: analyse → generate 4 designs → for every design check
 *   ATC on first mobile screen (360×640), sticky ATC after scroll, no horizontal overflow at
 *   360/768/1440, add-to-cart for every variant on mobile + desktop, Lighthouse mobile, SEO/AEO/GEO.
 * The first product is run twice to prove the second run gives different designs.
 * Writes results/RESULTS.md, results/results.json and screenshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT, config } from '../config.js';

process.env.RUN_LIGHTHOUSE ??= 'true';
const args = process.argv.slice(2).filter((a) => /^https?:/.test(a));
let competitorUrls: string[] | undefined;
if (!args.length) {
  process.env.CRAWL_PER_HOST_DELAY_MS ??= '100';
  const fx = await import('./fixtureServer.js');
  args.push(...fx.FIXTURE_PRODUCTS); competitorUrls = fx.FIXTURE_COMPETITORS;
}
await import('../index.js');
const API = `http://127.0.0.1:${config.port}`;
const OUT = path.join(ROOT, 'results'); fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const j = async (u: string, init?: RequestInit) => (await fetch(API + u, { ...init, headers: { 'content-type': 'application/json' } })).json() as Promise<any>;

async function runProduct(url: string, polish = 1) {
  const { id, error } = await j('/api/runs', { method: 'POST', body: JSON.stringify({ url, brief: { autoGenerate: true, polish, competitorUrls } }) });
  if (error) throw new Error(error);
  for (let i = 0; i < 400; i++) { const r = await j(`/api/runs/${id}`); if (r.status === 'done' || r.status === 'error') return r; await sleep(3000); }
  throw new Error('timeout');
}

async function selectVariant(page: Page, scope: string, v: any) {
  for (const [i, val] of v.options.entries()) {
    const input = page.locator(`${scope} input[data-lp-option="${i}"][value="${String(val).replace(/"/g, '\\"')}"]`).first();
    if (await input.count()) await page.locator(`${scope} label[for="${await input.getAttribute('id')}"]`).click();
  }
  const sel = page.locator(`${scope} select[data-lp-variant-select]`);
  if (await sel.count()) await sel.selectOption(String(v.id));
}

async function checkDesign(designId: string, product: any) {
  const b = await chromium.launch(); const res: any = { overflow: {}, atcAllVariants: {} };
  try {
    for (const [w, h] of [[360, 640], [768, 1024], [1440, 900]]) {
      const page = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 });
      await page.goto(`${API}/preview/${designId}`, { waitUntil: 'networkidle' });
      res.overflow[w] = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      await page.screenshot({ path: path.join(OUT, 'shots', `${designId}-${w}.png`), fullPage: w !== 768 });
      if (w === 360) {
        const box = await page.locator('[data-lp-main-atc]').boundingBox();
        res.atcAboveFold360 = !!box && box.y + box.height <= h;
        res.atcTop360 = box ? Math.round(box.y) : null;
        await page.mouse.wheel(0, 2200); await sleep(700);
        res.stickyAfterScroll = await page.locator('lp-sticky-atc.is-visible').count() > 0;
      }
      if (w === 360 || w === 1440) {
        let ok = 0, tried = 0; const fails: string[] = [];
        for (const v of product.variants) {
          await selectVariant(page, '.lp-hero', v);
          const idVal = await page.locator('.lp-hero [data-lp-variant-id]').inputValue();
          if (Number(idVal) !== v.id) { fails.push(`${v.title}: picker set ${idVal}`); continue; }
          const btn = page.locator('[data-lp-main-atc]');
          if (!v.available) { if (await btn.isDisabled()) ok++; else fails.push(`${v.title}: sold out but enabled`); tried++; continue; }
          tried++;
          const [resp] = await Promise.all([page.waitForResponse((r) => r.url().includes('/cart/add.js'), { timeout: 8000 }), btn.click()]);
          const body = await resp.json();
          if (resp.ok() && body.variant_id === v.id) ok++; else fails.push(`${v.title}: ${resp.status()}`);
          await sleep(150);
        }
        res.atcAllVariants[w] = { ok, tried, fails };
      }
      await page.close();
    }
  } finally { await b.close(); }
  return res;
}

const report: any[] = [];
const runs: { url: string; run: any }[] = [];
for (const url of args) { console.log('▶', url); runs.push({ url, run: await runProduct(url) }); }
console.log('▶ second run of', args[0]); const second = await runProduct(args[0]);

for (const { url, run } of [...runs, { url: args[0] + ' (run 2)', run: second }]) {
  if (run.status !== 'done') { report.push({ url, error: run.error }); continue; }
  const designs = [];
  for (const d of run.designs) {
    const c = await checkDesign(d.id, run.product);
    designs.push({ id: d.id, name: d.name, suffix: d.templateSuffix, fingerprint: d.fingerprint, diversity: { minHistory: d.diversity.minHistory, nearest: d.diversity.nearest?.[0]?.name ?? null, passed: d.diversity.passed }, seo: d.seo.score, lighthouse: d.lighthouse, applied: d.spec.appliedLearnings, ...c });
    console.log(`  ${d.name}: LH ${d.lighthouse?.performance}/${d.lighthouse?.accessibility}/${d.lighthouse?.seo} · atcFold ${c.atcAboveFold360} · sticky ${c.stickyAfterScroll} · overflow ${JSON.stringify(c.overflow)} · ATC ${JSON.stringify(Object.fromEntries(Object.entries(c.atcAllVariants).map(([k, v]: any) => [k, `${v.ok}/${v.tried}`])))}`);
  }
  report.push({ url, runId: run.id, title: run.product.title, category: run.category, group: run.group, competitors: run.competitors.filter((x: any) => x.status === 'ok').length, learnings: run.learnings.length, designs });
}
// diversity between run 1 and run 2 of the same product
const { distance } = await import('../services/fingerprint.js');
const r1 = report[0].designs || [], r2 = report[report.length - 1].designs || [];
const cross = r2.map((d: any) => ({ name: d.name, closestInRun1: Math.min(...r1.map((x: any) => distance(d.fingerprint, x.fingerprint).value)) }));

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), report, secondRunVsFirst: cross }, null, 2));
const yes = (b: boolean) => (b ? '✅' : '❌');
let md = `# Test results\n\nGenerated ${new Date().toISOString()} · ${args.length} products · Lighthouse = mobile, run on the local preview render of the same Liquid.\n\n`;
for (const r of report) {
  if (r.error) { md += `## ${r.url}\n\n❌ ${r.error}\n\n`; continue; }
  md += `## ${r.title} — ${r.category} (${r.group})\n\n${r.url} · run \`${r.runId}\` · ${r.competitors} competitor pages analysed · ${r.learnings} learnings\n\n`;
  md += `| Design | Hero / colour | Sections | LH perf | LH a11y | LH SEO | SEO/AEO/GEO | ATC 1st screen 360 | Sticky | Overflow 360/768/1440 | ATC all variants (mobile / desktop) | Distance to closest past |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const d of r.designs) {
    const a = d.atcAllVariants;
    md += `| ${d.name} \`${d.suffix}\` | ${d.fingerprint.heroType} / ${d.fingerprint.colorMode} | ${d.fingerprint.sectionOrder.join(' → ')} | ${d.lighthouse?.performance ?? '—'} | ${d.lighthouse?.accessibility ?? '—'} | ${d.lighthouse?.seo ?? '—'} | ${d.seo.SEO}/${d.seo.AEO}/${d.seo.GEO} | ${yes(d.atcAboveFold360)} (${d.atcTop360}px) | ${yes(d.stickyAfterScroll)} | ${[360, 768, 1440].map((w) => yes(!d.overflow[w])).join(' ')} | ${a[360]?.ok}/${a[360]?.tried} · ${a[1440]?.ok}/${a[1440]?.tried} | ${Math.round(d.diversity.minHistory * 100)}%${d.diversity.nearest ? ` (vs ${d.diversity.nearest})` : ''} |\n`;
  }
  md += `\nScreenshots: ${r.designs.map((d: any) => `[${d.name}](shots/${d.id}-360.png) · [desktop](shots/${d.id}-1440.png)`).join(' — ')}\n\n`;
}
md += `## Same product, second run\n\n| Run-2 design | Distance to closest run-1 design |\n|---|---|\n${cross.map((c: any) => `| ${c.name} | ${Math.round(c.closestInRun1 * 100)}% |`).join('\n')}\n\nDistance = 0.30·order + 0.15·section-set + 0.55·attributes (see README). Threshold: ${config.diversity.minDistanceHistory}.\n`;
fs.writeFileSync(path.join(OUT, 'RESULTS.md'), md);
console.log('\nwrote results/RESULTS.md');
process.exit(0);
