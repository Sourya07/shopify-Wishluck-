/**
 * Polite crawling helpers: robots.txt checks (cached per origin) and a per-host
 * rate limiter, shared by plain fetch() and Playwright navigations.
 */
import robotsParser from 'robots-parser';
import { config } from '../config.js';
import { sleep } from './util.js';

const robotsCache = new Map<string, Promise<ReturnType<typeof robotsParser> | null>>();
const lastHit = new Map<string, number>();

export async function waitForHost(url: string) {
  const host = new URL(url).host;
  for (;;) {
    const last = lastHit.get(host) ?? 0;
    const wait = last + config.crawl.perHostDelayMs - Date.now();
    if (wait <= 0) { lastHit.set(host, Date.now()); return; }
    await sleep(wait);
  }
}

async function getRobots(origin: string) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': config.crawl.userAgent }, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return robotsParser(`${origin}/robots.txt`, '');
        return robotsParser(`${origin}/robots.txt`, await res.text());
      } catch { return null; }
    })());
  }
  return robotsCache.get(origin)!;
}

/** true when robots.txt allows our UA (or robots.txt is unreachable/absent). */
export async function isAllowed(url: string) {
  const u = new URL(url);
  if (['localhost', '127.0.0.1'].includes(u.hostname)) return true;
  if (isOwnStoreHost(u.hostname)) return true; // our own store
  const robots = await getRobots(u.origin);
  if (!robots) return true;
  return robots.isAllowed(url, config.crawl.userAgent) !== false;
}

/** the store this app is connected to (SHOPIFY_STORE) */
export const isOwnStoreHost = (host: string) => !!config.shopify.store && host.replace(/^www\./, '') === config.shopify.store.replace(/^https?:\/\//, '').replace(/\/$/, '');

// ---- password-protected storefronts (every Shopify dev store) ----
const storefrontCookies = new Map<string, string>(); // host -> "storefront_digest=…"
export const storefrontCookie = (host: string) => storefrontCookies.get(host);

/**
 * Unlock a password-protected storefront with SHOPIFY_STOREFRONT_PASSWORD and keep the session cookies for that host.
 * Newer password pages need the form's authenticity_token + the cookies set by GET /password, so we read those first.
 */
export async function unlockStorefront(url: string) {
  const u = new URL(url); const pw = config.shopify.storefrontPassword;
  if (!pw) return false;
  if (storefrontCookies.has(u.host)) return true;
  const ua = { 'user-agent': config.crawl.userAgent };
  const jar = new Map<string, string>();
  const keep = (r: Response) => (r.headers.getSetCookie?.() ?? []).forEach((c) => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  try {
    const page = await fetch(`${u.origin}/password`, { headers: ua, redirect: 'manual', signal: AbortSignal.timeout(config.crawl.timeoutMs) });
    keep(page);
    const html = await page.text();
    const token = html.match(/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/)?.[1] || html.match(/value=["']([^"']+)["'][^>]*name=["']authenticity_token["']/)?.[1];
    const body = new URLSearchParams({ form_type: 'storefront_password', utf8: '✓', password: pw });
    if (token) body.set('authenticity_token', token);
    const r = await fetch(`${u.origin}/password`, {
      method: 'POST', redirect: 'manual', body,
      headers: { ...ua, 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(), origin: u.origin, referer: `${u.origin}/password` },
      signal: AbortSignal.timeout(config.crawl.timeoutMs),
    });
    keep(r);
    const loc = r.headers.get('location') || '';
    const ok = jar.has('storefront_digest') || (r.status >= 300 && r.status < 400 && !/\/password/.test(loc));
    if (!ok) return false;
    storefrontCookies.set(u.host, cookieHeader());
    return true;
  } catch { return false; }
}

const lockedOut = (r: Response) => new URL(r.url).pathname.startsWith('/password') || r.status === 401;

export async function politeFetch(url: string, init: RequestInit = {}) {
  if (!(await isAllowed(url))) throw new Error(`Blocked by robots.txt: ${url}`);
  const host = new URL(url).host;
  const go = async () => {
    await waitForHost(url);
    const cookie = storefrontCookies.get(host);
    return fetch(url, {
      ...init,
      headers: { 'user-agent': config.crawl.userAgent, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
      signal: init.signal ?? AbortSignal.timeout(config.crawl.timeoutMs),
    });
  };
  let res = await go();
  if (lockedOut(res)) {
    if (await unlockStorefront(url)) res = await go();
    if (lockedOut(res)) throw new Error(`401 storefront password required for ${host}${config.shopify.storefrontPassword ? ' (SHOPIFY_STOREFRONT_PASSWORD was rejected)' : ' — set SHOPIFY_STOREFRONT_PASSWORD in .env'}`);
  }
  return res;
}
