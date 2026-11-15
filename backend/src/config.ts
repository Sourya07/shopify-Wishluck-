import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
// .env lives in the project root (README); backend/.env is also accepted. Real env vars always win.
for (const f of [path.join(ROOT, '.env'), path.join(ROOT, 'backend', '.env')]) if (fs.existsSync(f)) dotenv.config({ path: f, quiet: true } as any);

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export const config = {
  port: Number(env('PORT', '4000')),
  publicUrl: env('PUBLIC_URL', `http://localhost:${env('PORT', '4000')}`),
  dataDir: path.resolve(ROOT, env('DATA_DIR', 'data')),
  shopifyDir: path.resolve(ROOT, 'shopify'),
  frontendDist: path.resolve(ROOT, 'frontend', 'dist'),

  llm: {
    provider: env('LLM_PROVIDER', 'openai') as 'openai' | 'anthropic' | 'none',
    apiKey: env('LLM_API_KEY'),
    model: env('LLM_MODEL', 'gpt-4o-mini'),
    visionModel: env('LLM_VISION_MODEL'),
    baseUrl: env('LLM_BASE_URL', 'https://api.openai.com/v1'),
    inputCostPerM: Number(env('LLM_INPUT_COST_PER_M', '0.15')),
    outputCostPerM: Number(env('LLM_OUTPUT_COST_PER_M', '0.60')),
  },

  search: {
    provider: env('SEARCH_PROVIDER', 'auto') as 'auto' | 'serpapi' | 'brave' | 'google' | 'seed',
    serpapiKey: env('SERPAPI_KEY'),
    braveKey: env('BRAVE_API_KEY'),
    googleKey: env('GOOGLE_CSE_KEY'),
    googleCx: env('GOOGLE_CSE_CX'),
    country: env('SEARCH_COUNTRY', 'in'),
  },

  crawl: {
    userAgent: env('CRAWL_USER_AGENT', 'WishluckLPBuilderBot/1.0 (+https://example.com/bot)'),
    perHostDelayMs: Number(env('CRAWL_PER_HOST_DELAY_MS', '1500')),
    maxCompetitors: Number(env('MAX_COMPETITORS', '10')),
    concurrency: Number(env('CRAWL_CONCURRENCY', '3')),
    timeoutMs: Number(env('CRAWL_TIMEOUT_MS', '30000')),
  },

  shopify: {
    store: env('SHOPIFY_STORE'), // my-store.myshopify.com
    adminToken: env('SHOPIFY_ADMIN_TOKEN'),
    clientId: env('SHOPIFY_CLIENT_ID'),
    clientSecret: env('SHOPIFY_CLIENT_SECRET'),
    apiVersion: env('SHOPIFY_API_VERSION', '2025-10'),
    themeId: env('SHOPIFY_THEME_ID'),
    allowLiveTheme: env('SHOPIFY_ALLOW_LIVE_THEME', 'false') === 'true',
    storefrontPassword: env('SHOPIFY_STOREFRONT_PASSWORD'),
  },

  lighthouse: env('RUN_LIGHTHOUSE', 'true') === 'true',
  diversity: {
    minDistanceHistory: Number(env('MIN_DISTANCE_HISTORY', '0.35')),
    minDistanceSiblings: Number(env('MIN_DISTANCE_SIBLINGS', '0.40')),
    historyWindow: Number(env('HISTORY_WINDOW', '12')),
  },
};
