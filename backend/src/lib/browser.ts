import { chromium, type Browser, type BrowserContext, devices } from 'playwright';
import { config } from '../config.js';
import { isAllowed, waitForHost, unlockStorefront, storefrontCookie, isOwnStoreHost } from './polite.js';

let browserP: Promise<Browser> | null = null;
export function getBrowser() {
  if (!browserP) browserP = chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return browserP;
}
export async function closeBrowser() { if (browserP) { (await browserP).close().catch(() => {}); browserP = null; } }

const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
/** asOwner: browsing our OWN store — plain Chrome identity (no crawler suffix). Competitor crawling always identifies itself. */
export async function newContext(kind: 'desktop' | 'mobile', opts: { asOwner?: boolean } = {}): Promise<BrowserContext> {
  const b = await getBrowser();
  const suffix = opts.asOwner ? '' : ' ' + config.crawl.userAgent;
  const ctx = await (kind === 'mobile'
    ? b.newContext({ ...devices['Pixel 7'], userAgent: devices['Pixel 7'].userAgent + suffix, locale: 'en-IN' })
    : b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA + suffix, locale: 'en-IN' }));
  // tsx/esbuild (keepNames) wraps functions in __name(); define it so page.evaluate callbacks run in the page
  await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
  return ctx;
}

/** Navigate respecting robots.txt + per-host delay; blocks heavy third-party media to stay light. */
export async function politeGoto(ctx: BrowserContext, url: string) {
  if (!(await isAllowed(url))) throw new Error('Blocked by robots.txt');
  await waitForHost(url);
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    return t === 'media' ? route.abort() : route.continue();
  });
  const host = new URL(url).host; const own = isOwnStoreHost(new URL(url).hostname);
  const addCookie = async () => { const c = storefrontCookie(host); if (c) await ctx.addCookies(c.split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: host, path: '/' }; })); };
  if (!own) await addCookie(); // own store: unlock inside the browser (Shopify ties the session to the browser that unlocked it)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.crawl.timeoutMs });
  const onPassword = () => new URL(page.url()).pathname.startsWith('/password');
  if (onPassword() && config.shopify.storefrontPassword) { // dev-store password page
    if (!own && (await unlockStorefront(url))) { await addCookie(); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.crawl.timeoutMs }); }
    if (onPassword()) {
      const input = page.locator('input[type="password"]').first();
      if (await input.count()) {
        await input.fill(config.shopify.storefrontPassword);
        await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/password'), { timeout: 15000 }).catch(() => {}), input.press('Enter')]);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.crawl.timeoutMs });
      }
    }
    if (onPassword()) throw new Error('Storefront password page could not be unlocked — check SHOPIFY_STOREFRONT_PASSWORD');
  }
  // Shopify's bot-protection interstitial: never analyse it as if it were the page
  const blocked = async () => /there was a problem loading this website|checking your browser|verify you are human|access denied/i.test((await page.title().catch(() => '')) + ' ' + ((await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).slice(0, 400)));
  if (await blocked()) {
    await page.waitForTimeout(2500); await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    if (await blocked()) throw new Error('Blocked by the site’s bot protection (served an interstitial instead of the page)');
  }
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  // dismiss common popups so screenshots show the page
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('[class*="popup"],[class*="modal"],[id*="popup"],[class*="newsletter"],[aria-modal="true"]').forEach((el) => {
      const s = getComputedStyle(el as HTMLElement); if (s.position === 'fixed') (el as HTMLElement).style.display = 'none';
    });
  }).catch(() => {});
  return page;
}
