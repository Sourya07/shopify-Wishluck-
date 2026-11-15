/** Runs Shopify Theme Check on the generated sections/snippets + every generated JSON template. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check } from '@shopify/theme-check-node';
import { config } from '../config.js';
import { db } from '../lib/db.js';
import { buildTheme } from './buildTheme.js';

buildTheme();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-theme-'));
for (const sub of ['sections', 'snippets', 'assets']) fs.cpSync(path.join(config.shopifyDir, sub), path.join(dir, sub), { recursive: true });
for (const sub of ['layout', 'config', 'locales', 'templates']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
fs.writeFileSync(path.join(dir, 'layout/theme.liquid'), '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>');
fs.writeFileSync(path.join(dir, 'config/settings_schema.json'), '[{"name":"theme_info","theme_name":"x","theme_version":"1","theme_author":"x","theme_documentation_url":"https://x.com","theme_support_url":"https://x.com"}]');
fs.writeFileSync(path.join(dir, 'locales/en.default.json'), '{}');
const rows: any[] = db.prepare(`SELECT template_suffix, template_json FROM designs WHERE status != 'discarded' ORDER BY created_at DESC LIMIT 40`).all();
for (const r of rows) fs.writeFileSync(path.join(dir, 'templates', `product.${r.template_suffix}.json`), r.template_json);
const offenses = (await check(dir)).filter((o) => !/\/(layout|config|locales)\//.test(o.uri));
for (const o of offenses) console.log(['error', 'warning', 'info'][o.severity] ?? o.severity, o.check, o.uri.split(dir)[1], `L${(o.start?.index ?? 0)}`, o.message);
console.log(`Theme Check: ${offenses.length} offenses in ${fs.readdirSync(path.join(dir, 'sections')).length} sections + ${rows.length} templates`);
process.exit(offenses.some((o) => o.severity === 0) ? 1 : 0);
