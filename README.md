# Wishluck · AI Landing Page Builder for Shopify

Paste a Shopify product URL → the system reads the product and your brand, studies 8–12 competitor pages, learns what works, and generates **3–4 genuinely different landing pages** as **Online Store 2.0 sections + JSON templates** that publish to your theme and are fully editable in the theme editor. It remembers what it learned and what it built, so the next product in the same category gets fresh designs.

```
backend/    Express + TypeScript API: crawling, analysis, design engine, preview renderer, checks, Shopify publish
frontend/   React (Vite) dashboard
shopify/    The theme code: src/sections (source) → sections/ (built), snippets/, assets/
results/    Test report for the 5 test products (RESULTS.md, results.json, screenshots)
```

---

## Quick start

```bash
cp .env.example .env          # everything is optional except SHOPIFY_* for publishing
npm run setup                 # installs backend + frontend, downloads Chromium for Playwright
npm run dev                   # API on :4000, dashboard on http://localhost:5173
```

One command with Docker (API + dashboard on http://localhost:4000):

```bash
cp .env.example .env && docker compose up --build
```

Offline test of the full pipeline (no keys, no internet — a fixture Shopify store with 5 products and 10 competitor pages):

```bash
npm test                                  # writes results/RESULTS.md
npm test -- https://store.com/products/a https://store.com/products/b   # real public product URLs
npm run theme:check                       # Shopify Theme Check on all sections + generated templates
```

### Connecting the Shopify dev store

1. Partners dashboard → Stores → create a **development store**. In *Online Store → Themes*, add **Dawn** and **Duplicate** it (the tool never writes to the live theme unless `SHOPIFY_ALLOW_LIVE_THEME=true`). Name the copy “LP Builder” and it is auto-detected, or set `SHOPIFY_THEME_ID`.
2. Create an app with Admin API scopes **`read_themes, write_themes, read_products, write_products, read_publications, write_publications`** (`write_publications` is only needed to import products into the store).
   - Legacy custom app → put the `shpat_…` token in `SHOPIFY_ADMIN_TOKEN`, **or**
   - Dev Dashboard app installed on the store → `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` (the client-credentials token is fetched and refreshed automatically).
3. Set `SHOPIFY_STORE=your-store.myshopify.com`. The nav bar shows the store when it's connected.

Theme files can be written through the Admin API (`themeFilesUpsert`) only by apps that Shopify allows to edit theme files; a custom app / Dev Dashboard app installed on your own dev store qualifies. If you can't get that access, use **Download zip** and upload with `shopify theme push` or *Edit code*.

---

## How it works

```
 Paste URL ─► 1 Product ─► 2 Brand ─► 3 Competitors ─► 4 Learnings ─► ⏸ Review (edit brand / trust data)
                                                                          │
           ┌──────────────────────────────────────────────────────────────┘
           ▼
 5 Plan designs (memory + feedback + learnings) ─► 6 Copy ─► 7 JSON template ─► 8 Preview render
           ─► 9 SEO / AEO / GEO checks + Lighthouse ─► Approve · Reject · Regenerate · Publish · A/B
```

**Change from the suggested flow:** the run pauses after analysis (status *review*) so the team can fix a wrong button colour, font or trust claim *before* any design is generated — corrections then flow into all designs. Unattended runs can skip the pause (`autoGenerate`).

Progress streams to the dashboard over Server-Sent Events.

### 1 · Product analysis (`services/product.ts`)
Shopify exposes structured data at `/products/<handle>.js` (variant IDs, prices in paise/cents, options, media) and `.json` (type, tags, image alt). Those are merged with the rendered HTML for things only the page shows: **rating and review texts are taken only from the page’s JSON-LD / microdata** (nothing is invented), the collection link (for internal linking), and policy phrases (COD, returns, delivery estimate, free shipping) found inside individual page elements. Specs come from description tables and `Label: value` lines.

### 2 · Brand analysis (`services/brand.ts`)
Playwright renders the product page and reads **computed styles** — `<body>` background/text, the H1 font family/size/weight, the add-to-cart button’s background, text colour, border and radius, Dawn’s CSS variables, section paddings — plus a **screenshot quantised into a pixel-share palette**.
- *Primary* = ATC button colour; if that is neutral (black/white), the most common saturated screenshot colour.
- *Secondary* = theme accent / announcement bar / link colour / screenshot, whichever is distinct.
- *Fonts* are mapped to the **Shopify font library** (`font_picker` handles) — exact match, alias table (e.g. Gilroy → Montserrat, SF Pro → Inter, Didot → Playfair Display) or closest by classification.
- *Tone & image style*: a vision LLM on screenshot + copy when a key is set, otherwise a keyword/price/palette heuristic.
Every value carries an **evidence string** shown in the dashboard; every value is editable.

### 3 · Competitor research (`services/search.ts`, `services/competitors.ts`)
- **Search**: SerpAPI, Brave or Google CSE (whichever key exists) with 4 India-biased queries built from the category + product keywords (`gl=in`). Marketplaces, social and our own domain are dropped; **Indian D2C** domains (known list, `.in`, INR in snippet) and direct `/products/` URLs rank first. For a brand home/collection page on a Shopify store, the matching product is resolved through the store’s predictive search (`/search/suggest.json`).
- **No search key?** A curated list of Indian D2C Shopify brands per category group is used (labelled “curated list” in the reason). You can also paste competitor URLs in the brief.
- **Crawl**: desktop (1440) + mobile (Pixel 7) screenshots and DOM. robots.txt is checked for every URL (cached per origin), with a per-host delay (`CRAWL_PER_HOST_DELAY_MS`) and limited concurrency. Media requests are blocked; popups are hidden for clean screenshots.
- **Breakdown** (pure DOM heuristics, so it is fast and explainable): section order (buy box, reviews, benefits, specs, comparison, UGC, offer, story, FAQ, recommendations…), headline style, compare-at/discount display, rating within 220 px of the price, trust badges, guarantee, COD, returns, delivery estimate, ATC above the fold on mobile/desktop, **sticky ATC** (scroll and look for a fixed button), repeated ATC, FAQ count, video, urgency, bundles, size guide, and unusual things (pincode checker, 3D viewer, WhatsApp, EMI messaging, countdowns…).
- **Nothing is copied**: only booleans, counts and section names are stored. All copy is written from the product’s own facts.

### 4 · Learnings + memory (`services/learnings.ts`)
22 rules turn features into statements like **“6 of 8 pages keep a sticky add-to-cart bar on mobile”**, each linked to the source pages. The tool also reports unusual patterns, *gaps* (“only 1 of 8 has a comparison — a chance to stand out”) and the most common section bigrams (“reviews → faq”).
Learnings are saved **per category and per category group** (`t-shirts` and `group:clothing`) with cumulative counts, so research for one tee helps the next tee — and, more weakly, the next hoodie.

### 5 · Design planning and “no repeats” (`services/designEngine.ts`, `services/fingerprint.ts`)
Five directions: **Story led, Benefit grid, Social proof heavy, Offer led, Facts first (GEO)**. Each has 3 section-order templates, several hero layouts, colour-usage modes, type scales and benefit/FAQ styles → **~230 candidate layouts** per product.

Candidates are adapted to real data (no review texts → no reviews section; < 3 specs → no comparison; every page gets FAQ + specs for AEO/GEO) and to learnings with ≥ 40 % support (repeat ATC after benefits, sticky ATC, rating next to price, FAQ near the end, trust strip, reviews after benefits, comparison when it's a gap…). The applied learnings are listed on each design.

**Layout fingerprint** = direction, hero type, section order, colour usage (light / tint / dark / bold), ATC placement (e.g. `hero+mid+sticky`), density, type scale, imagery, benefits layout, FAQ style.

**How “different” is measured** — a distance in [0, 1]:

```
distance = 0.30 × (1 − LCS(order A, order B) / max length)     order similarity
         + 0.15 × (1 − Jaccard(section sets))                   which sections exist
         + 0.55 × weighted share of differing attributes        hero 0.20, direction 0.20, colour 0.15,
                                                                ATC 0.10, imagery 0.10, type 0.07, …
```

A design is only picked if its distance to **every one of the last 12 designs in this category** is ≥ `MIN_DISTANCE_HISTORY` (0.35, shifted ±0.05 by the Creativity slider) and ≥ `MIN_DISTANCE_SIBLINGS` (0.40) to the other designs of the same run; siblings must also use different directions and hero types. If the pool is exhausted the threshold relaxes in 0.05 steps and the dashboard says so. The **Diversity check** card shows the three closest past designs with a threshold marker, the score breakdown, and sibling distances.

**Feedback signals**: Approve (+1), Publish (+2), Reject (−1.5, optional reason) are stored with the design’s fingerprint. Future candidates sharing attributes with liked designs score higher, disliked ones lower; reject reasons are parsed (“too dark”, “too busy”, “too plain”, “too loud”, “font too big”, “image…”) into targeted penalties and are also passed to the copywriter.

Brief sliders: **Creativity** (Safe ↔ Wild) trades learning/feedback weight for distance and randomness; **Density** (Calm ↔ Busy) sets spacing and section count; **Polish** (Quick ↔ Obsessive) sets competitor count and Lighthouse coverage.

### 6 · Copy (`services/copywriter.ts`)
One LLM call per design, grounded in a fact sheet (title, price, options, specs, description, policies, rating), the brand tone, the direction, the user’s concept/notes, past headings to avoid and past reject reasons. Guard-rails after the call: **any number not present in the source facts is dropped**, spec rows/stats/comparison/policies always come from real data, FAQs fall back if fewer than 4. Without a key a deterministic writer produces the same structure from the product data.

### 7 · Shopify sections (`shopify/`)
13 reusable sections (`lp-hero`, `lp-trust-bar`, `lp-story`, `lp-benefits`, `lp-specs`, `lp-comparison`, `lp-reviews`, `lp-gallery`, `lp-offer`, `lp-faq`, `lp-cta`, `lp-sticky-atc`, `lp-ab-test`), 5 snippets and 2 assets (`lp-base.css` 6 KB, `lp-product.js` 3 KB, no libraries). Each design is a **JSON template** `templates/product.lp-<category>-<run>-<n>.json` that orders the sections and sets every setting.

Editable in the theme editor — nothing visual is hardcoded:
- **Every section** has colour pickers (background, text, accent, button, button text), **font pickers** (heading, body), heading size, corner radius and padding — the brand values are written into these settings.
- Layout `select`s per section (6 hero layouts, 4 story, 4 benefits, 2 specs, 4 reviews, 3 gallery, 3 offer, 3 FAQ, 3 CTA), image pickers with product-image fallback, text/richtext for all copy, show/hide toggles.
- Repeating content is **blocks**: highlights, trust items, benefits, stats, spec rows, comparison rows, reviews, gallery images, perks, FAQs. Hero and reviews also accept **`@app` blocks** (drop in Judge.me / Loox etc.).
- Every section has a `product` setting, so it also works on a normal page template.

Add to cart: real `{% form 'product' %}` posting `id` (variant ID) + `quantity` to `/cart/add` — works without JS. JS enhances it: variant pills/dropdown resolve the exact variant, update price/compare-at/% off, disable sold-out combinations, update `?variant=`, AJAX `/cart/add.js` with a toast and cart-count update (or “go to cart” via a setting). Trust row under the button shows **only real data** (rating, delivery, COD, returns — editable in the brand panel). Mobile: compact hero keeps ATC on the first screen; `lp-sticky-atc` appears once the main button scrolls away (IntersectionObserver). Images use `image_url` + `image_tag` with `srcset/sizes`, the first image is `eager` + `fetchpriority=high`, everything else lazy.

Publishing (`services/shopify.ts`): uploads `lp-*` files + the template with `themeFilesUpsert`, finds the product by handle (or imports it with `productSet` — title, description, options, variants, images — and publishes it to the Online Store), sets `templateSuffix` and the product **SEO title/description**, and returns a storefront preview link (`?view=<suffix>&preview_theme_id=…`) and a **theme editor deep link**. If Shopify rejects a font handle it retries with Assistant and tells you. **Zip download** per design or per run for manual upload.

### 8 · Preview renderer (`services/preview.ts`)
The dashboard previews are rendered by **liquidjs from the exact same section files** that are uploaded, with mocks for the Shopify objects/filters they use (`product`, `form`, `image_url`, `image_tag`, `money`, `font_face`, schema defaults…). Previews power the device switcher (360 / 768 / 1440), the checklist and Lighthouse before anything is published. A mock `/cart/add.js` validates variant IDs so add-to-cart can be tested on every variant.

### 9 · SEO / AEO / GEO (`services/seo.ts`)
| | What the page does | What the checklist verifies |
|---|---|---|
| **SEO** | One H1 (product title), h2/h3 below, meta title/description set on the product, `alt` on every image, canonical from the theme, readable handle, breadcrumb link to the collection, **Product JSON-LD** with every variant as an Offer (price, currency, availability, SKU) and `aggregateRating` **only if the source page had a real rating** | one H1, heading order, meta lengths, alt coverage, canonical, handle, collection link, JSON-LD parse + required fields, rating honesty |
| **AEO** | FAQ blocks with direct 1–3 sentence answers that repeat the product name (size, material, delivery, COD, returns, care, what's in the box, warranty — only when the facts exist) + **FAQPage JSON-LD** generated from the same blocks, so editor changes stay in sync | ≥ 4 questions, schema = visible FAQ, answers 40–360 chars and self-contained, topic coverage |
| **GEO** | Specs table, “who it's for”, “what's in the box”, care cards, brand name used consistently, no unsupported superlatives | ≥ 5 spec rows, material, size/dimensions, audience/box, brand mentions, vague-claim detector, price in text |

The Google **Rich Results Test** can't be automated honestly, so it's marked *manual* with a prefilled link once a design is published. Dev stores are password-protected; use the Rich Results Test's *code* mode (paste the page source) or remove the password temporarily.

---

## AI choice and cost per run

| Step | Calls | Default model | Why |
|---|---|---|---|
| Brand tone + image style (vision) | 1 | `gpt-4o-mini` (or any vision model) | cheap, good enough for a 3-word tone; falls back to heuristics |
| Copy per design | 3–4 | `gpt-4o-mini` | JSON mode, fast; the guard-rails matter more than model size |

Measured token budget: ~12–15 k input, ~6 k output per run. **≈ $0.006 / run on gpt-4o-mini**, ≈ $0.09 on gpt-4o, ≈ $0.13 on Claude Sonnet (switch with `LLM_PROVIDER=anthropic`). Search adds 4 queries (≈ $0.02–0.06 on SerpAPI paid plans; Brave has a free tier). The dashboard shows actual calls and cost for each run. Any OpenAI-compatible endpoint works (Gemini, OpenRouter, Groq, local Ollama).

## Other choices
- **Express + TypeScript (tsx)** — no build step, one process serves API, previews and the built dashboard.
- **SQLite (better-sqlite3)** — runs, events, designs + fingerprints, learnings, signals, A/B events in one file; zero setup, easy to move to Postgres.
- **Playwright** — real computed styles and screenshots; the same Chromium runs Lighthouse.
- **liquidjs** — previews from the real Liquid, so what you check is what you publish.

## Extras
- **A/B test**: pick two designs → both templates are published with an invisible `lp-ab-test` section; visitors are split 50/50 by cookie (B served via `?view=`), views and add-to-carts are beaconed to `/api/ab/:id/event`; the A/B page shows ATC rate per variant. (The beacon needs `PUBLIC_URL` to be reachable from the shopper's browser — fine for your own testing on localhost; deploy the API for real traffic.)
- **Docker**: `docker compose up --build`.
- **Theme Check** script and an **offline e2e test** with a fixture store.

---

## Test results

`npm test` runs 5 products in 2+ categories (tee, hoodie, cargo pants — clothing; pearl earrings, laptop backpack — accessories), then runs the tee again. For every design it checks ATC on the first 360×640 screen, sticky ATC after scrolling, horizontal overflow at 360/768/1440, add to cart on **every variant** on mobile and desktop, Lighthouse (mobile), the SEO/AEO/GEO checklist, and the distance of run-2 designs to run-1 designs. See **[results/RESULTS.md](results/RESULTS.md)** (screenshots in `results/shots/`).

The included results were produced **offline against the fixture store**, because the build environment had no access to real storefronts or a Shopify store. Lighthouse there measures the *local preview* render. On a real store, run `npm test -- <real product URLs>` and use **Run on live store** in the dashboard after publishing to measure the actual theme (Dawn's own header, fonts and apps add weight).

## Dashboard
Black & white with a single light-blue accent. **New** — paste a URL and use *Make it yours*: concept, fonts, colours, competitor URLs, copy notes, 3 or 4 designs and three sliders (Creativity Safe↔Wild, Density Calm↔Busy, Polish Quick↔Obsessive). A live *Generation brief* on the right highlights the parts you changed. **Run** — live progress log (SSE) and stage stepper; tabs for Brand (editable swatches, font pickers mapped to Shopify fonts, tone, radius, trust data, evidence + screenshot), Competitors (desktop/mobile screenshots, reason picked, section chips, detected patterns), Learnings (fractions, source links, category memory) and Designs (mobile/tablet/desktop preview, SEO/AEO/GEO + Lighthouse rings, diversity check, checklist, fingerprint, applied learnings, Approve / Reject with reason / Regenerate / Zip / Publish). **History**, **Memory** (learnings by category, signals, fingerprints) and **A/B tests**.

## Recording the demo (5–7 min shot list)
1. New → paste a dev-store product URL, nudge Creativity, *Build pages* → live log (≈1 min).
2. Brand tab → fix a colour → *Save & generate*. Competitors + Learnings tabs.
3. Designs → switch 4 designs, Mobile 360 / Desktop 1440, scores + diversity card.
4. *Publish to Shopify* → open **Theme editor ↗** → change heading font + button colour in a section, reorder an FAQ block.
5. Storefront ↗ → pick a variant → Add to cart → cart shows the right variant; scroll on mobile for the sticky bar.
6. Run the same product (or another tee) again → diversity card shows the distance to run 1.

## Known issues / limitations
- **Not yet verified against a live Shopify store from this environment** — the publish flow is written against the Admin GraphQL API (2025-10: `themeFilesUpsert`, `productSet`, `productUpdate(product:)`) but has to be smoke-tested with your dev store credentials. Font handles are validated by Shopify; unknown ones fall back to Assistant.
- Competitor feature extraction is heuristic; unusual DOMs (heavy shadow DOM, canvas, very custom page builders) can be misclassified. Screenshots and section chips make that visible.
- Some stores block bots via robots.txt or Cloudflare; those competitors show as *blocked* and are skipped (not worked around).
- Lighthouse on the preview is an approximation of production; a live run depends on the theme and installed apps.
- The comparison section compares our published specs to “Typical alternative: Varies” — honest but generic. Edit it or remove it per page.
- Product images are reused for gallery/story imagery; there is no image generation yet.
- Rating shown must exist on the source page or in the standard `reviews.rating` metafield — products without reviews get a lighter proof section by design.

## What I'd do next
1. Generated brand-styled banners/lifestyle images (image model + brand palette) uploaded to Shopify Files.
2. Vision-model pass over competitor screenshots to complement DOM heuristics (hero type, visual density).
3. Learn from A/B results: feed ATC rate back into feedback scores automatically.
4. Page templates (`templates/page.*.json`) for campaign pages with multiple products / bundles.
5. Postgres + job queue for parallel runs; auth for a multi-user dashboard.
