import crypto from 'node:crypto';
export const uid = (p = '') => p + crypto.randomBytes(5).toString('hex');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
export const stripHtml = (s = '') => s.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function pLimit(n: number) {
  let active = 0; const q: (() => void)[] = [];
  const next = () => { active--; q.shift()?.(); };
  return <T>(fn: () => Promise<T>): Promise<T> => new Promise((res, rej) => {
    const run = () => { active++; fn().then(res, rej).finally(next); };
    active < n ? run() : q.push(run);
  });
}
