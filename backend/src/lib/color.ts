export type RGB = [number, number, number];
export const toHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
export function parseColor(c?: string | null): { rgb: RGB; alpha: number } | null {
  if (!c) return null;
  c = c.trim();
  let m = c.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { rgb: [+m[1], +m[2], +m[3]], alpha: a };
  }
  m = c.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1]; if (h.length <= 4) h = h.split('').map((x) => x + x).join('');
    return { rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = c.match(/^([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)$/); // Dawn stores "18,18,18"
  if (m) return { rgb: [+m[1], +m[2], +m[3]], alpha: 1 };
  return null;
}
export const hexOf = (c?: string | null) => { const p = parseColor(c); return p && p.alpha > 0.5 ? toHex(p.rgb) : null; };
export const rgbOf = (hex: string): RGB => parseColor(hex)?.rgb ?? [0, 0, 0];
export function luminance(hex: string) {
  const [r, g, b] = rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export function saturation(hex: string) { const [r, g, b] = rgbOf(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
export const dist = (a: string, b: string) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
export const isNeutral = (hex: string) => saturation(hex) < 0.12;
export function mix(a: string, b: string, t: number) { const x = rgbOf(a), y = rgbOf(b); return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB); }
export const readableOn = (bg: string) => (contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111');
/** darken/lighten a colour until it reaches the target contrast against bg (accessibility guard). */
export function ensureContrast(fg: string, bg: string, target = 4.5) {
  let c = fg; const dir = luminance(bg) > 0.4 ? '#000000' : '#ffffff';
  for (let i = 0; i < 20 && contrast(c, bg) < target; i++) c = mix(c, dir, 0.12);
  return c;
}
