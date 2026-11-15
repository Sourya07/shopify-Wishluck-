/**
 * Layout fingerprints and the "how different is it" metric.
 *
 * distance(a, b) ∈ [0, 1] =
 *   0.30 × (1 − LCS(sectionOrderA, sectionOrderB) / maxLen)      order similarity
 * + 0.15 × (1 − Jaccard(sectionSetA, sectionSetB))                which sections exist
 * + 0.55 × weighted share of differing attributes                  hero type, colour usage, ATC placement …
 */
import type { Fingerprint } from '../types.js';

export const ATTR_WEIGHTS: Record<string, number> = {
  direction: 0.2, heroType: 0.2, colorMode: 0.15, atcPlacement: 0.1, imageTreatment: 0.1,
  density: 0.06, typeScale: 0.07, benefitLayout: 0.06, faqStyle: 0.06,
};

function lcs(a: string[], b: string[]) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let k = 1; k <= b.length; k++) dp[i][k] = a[i - 1] === b[k - 1] ? dp[i - 1][k - 1] + 1 : Math.max(dp[i - 1][k], dp[i][k - 1]);
  return dp[a.length][b.length];
}

export function distance(a: Fingerprint, b: Fingerprint) {
  const oa = a.sectionOrder.filter((s) => s !== 'sticky_atc'), ob = b.sectionOrder.filter((s) => s !== 'sticky_atc');
  const orderSim = lcs(oa, ob) / Math.max(oa.length, ob.length, 1);
  const sa = new Set(oa), sb = new Set(ob);
  const inter = [...sa].filter((x) => sb.has(x)).length, union = new Set([...sa, ...sb]).size || 1;
  const jac = inter / union;
  let diff = 0;
  for (const [k, w] of Object.entries(ATTR_WEIGHTS)) if ((a as any)[k] !== (b as any)[k]) diff += w;
  const parts = { order: +(1 - orderSim).toFixed(3), sections: +(1 - jac).toFixed(3), attributes: +diff.toFixed(3) };
  return { value: +(0.3 * parts.order + 0.15 * parts.sections + 0.55 * parts.attributes).toFixed(3), parts };
}

export const fingerprintOf = (s: Fingerprint): Fingerprint => ({
  direction: s.direction, heroType: s.heroType, sectionOrder: s.sectionOrder, colorMode: s.colorMode, atcPlacement: s.atcPlacement,
  density: s.density, typeScale: s.typeScale, imageTreatment: s.imageTreatment, benefitLayout: s.benefitLayout, faqStyle: s.faqStyle,
});

export const fingerprintHash = (f: Fingerprint) =>
  [f.direction, f.heroType, f.colorMode, f.atcPlacement, f.density, f.typeScale, f.imageTreatment, f.benefitLayout, f.faqStyle, f.sectionOrder.join('>')].join('|');
