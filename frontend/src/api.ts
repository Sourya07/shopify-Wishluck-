export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, { ...rest, method: rest.method || (json ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(rest.headers || {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}
export type Brief = { concept?: string; notes?: string; headingFont?: string; bodyFont?: string; colors?: string; competitorUrls?: string; creativity: number; density: number; polish: number; count: number };
export const money = (cents: number, cur = 'INR') => { try { return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); } catch { return String(cents / 100); } };
export const ago = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString(); };
