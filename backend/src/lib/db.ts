import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(path.join(config.dataDir, 'lp-builder.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT,
  category TEXT,
  category_group TEXT,
  product_json TEXT,
  brand_json TEXT,
  competitors_json TEXT,
  learnings_json TEXT,
  cost_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  category TEXT,
  category_group TEXT,
  direction TEXT NOT NULL,
  name TEXT NOT NULL,
  template_suffix TEXT NOT NULL,
  fingerprint_json TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  content_json TEXT NOT NULL,
  template_json TEXT NOT NULL,
  diversity_json TEXT,
  seo_json TEXT,
  lighthouse_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  reject_reason TEXT,
  published_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learnings (
  id TEXT NOT NULL,
  category TEXT NOT NULL,
  statement TEXT NOT NULL,
  count INTEGER NOT NULL,
  total INTEGER NOT NULL,
  sources_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id, category)
);
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  design_id TEXT NOT NULL,
  category TEXT,
  category_group TEXT,
  kind TEXT NOT NULL,          -- approve | publish | reject
  reason TEXT,
  fingerprint_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ab_tests (
  id TEXT PRIMARY KEY,
  product_handle TEXT NOT NULL,
  design_a TEXT NOT NULL,
  design_b TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ab_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  event TEXT NOT NULL,         -- view | atc
  created_at TEXT NOT NULL
);
`);

export const now = () => new Date().toISOString();
export const j = <T = any>(s: string | null | undefined, d: T = null as T): T => {
  if (!s) return d;
  try { return JSON.parse(s) as T; } catch { return d; }
};
