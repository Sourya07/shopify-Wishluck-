import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { api } from './routes/api.js';
import { db, j } from './lib/db.js';
import { buildTheme } from './scripts/buildTheme.js';
import { closeBrowser } from './lib/browser.js';

buildTheme(); // always serve/upload freshly built sections
const app = express();
app.use(cors());
app.use('/api/ab/:id/event', express.text({ type: '*/*' }));
app.use(express.json({ limit: '5mb' }));
app.use('/api', api);

app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\n'));
// ---- local preview of generated designs (same Liquid as Shopify) ----
app.get('/preview/:id', (req, res) => {
  const d: any = db.prepare('SELECT run_id FROM designs WHERE id = ?').get(req.params.id); if (!d) return res.sendStatus(404);
  res.sendFile(path.join(config.dataDir, 'runs', d.run_id, 'designs', `${req.params.id}.html`));
});
app.use('/preview-assets', express.static(path.join(config.shopifyDir, 'assets'), { maxAge: '1d' }));
app.use('/data', express.static(config.dataDir, { maxAge: '1h' }));
// mock Shopify cart for previews: validates the variant id exactly like /cart/add.js would
const previewCart: { id: number; quantity: number }[] = [];
app.post(['/cart/add.js', '/preview/cart/add.js'], express.urlencoded({ extended: true }), express.text({ type: 'multipart/form-data' }), (req, res) => {
  // FormData posts arrive as multipart; read the two fields we need
  const field = (n: string) => typeof req.body === 'string' ? req.body.match(new RegExp(`name="${n}"\\r?\\n\\r?\\n([^\\r\\n]*)`))?.[1] : req.body?.[n];
  const id = Number(field('id')), qty = Math.max(1, Number(field('quantity')) || 1);
  const rows: any[] = db.prepare('SELECT product_json FROM runs WHERE product_json IS NOT NULL').all();
  for (const r of rows) {
    const p = j<any>(r.product_json); const v = p?.variants?.find((x: any) => x.id === id);
    if (v) {
      if (!v.available) return res.status(422).json({ status: 422, message: 'Cart Error', description: `${p.title} - ${v.title} is sold out.` });
      previewCart.push({ id, quantity: qty });
      return res.json({ id, variant_id: id, quantity: qty, product_title: p.title, variant_title: v.title, price: v.price, preview: true });
    }
  }
  res.status(404).json({ status: 404, message: 'Cart Error', description: 'Variant not found' });
});
app.get('/cart.js', (_req, res) => res.json({ item_count: previewCart.reduce((a, b) => a + b.quantity, 0), items: previewCart }));

// any error that escapes a route → JSON, never a stack trace
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err); if (!res.headersSent) res.status(err?.status || 500).json({ error: err?.message || 'Server error' });
});

if (fs.existsSync(config.frontendDist)) {
  app.use(express.static(config.frontendDist));
  app.get(/^\/(?!api|preview|data).*/, (_req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
}
const server = app.listen(config.port, () => console.log(`LP Builder API on ${config.publicUrl}`));
const shutdown = async () => { await closeBrowser(); server.close(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
