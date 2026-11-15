/** Lighthouse (mobile) via the Playwright-bundled Chromium. Returns category scores 0–100. */
import { chromium } from 'playwright';

export async function runLighthouse(url: string): Promise<{ performance: number; accessibility: number; seo: number; bestPractices: number; url: string; error?: string }> {
  try {
    const [{ default: lighthouse }, chromeLauncher] = await Promise.all([import('lighthouse'), import('chrome-launcher')]);
    const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
    try {
      const r: any = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'], formFactor: 'mobile' } as any);
      const c = r.lhr.categories;
      return { url, performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100), seo: Math.round(c.seo.score * 100), bestPractices: Math.round(c['best-practices'].score * 100) };
    } finally { await chrome.kill(); }
  } catch (e: any) {
    return { url, performance: 0, accessibility: 0, seo: 0, bestPractices: 0, error: e.message };
  }
}
