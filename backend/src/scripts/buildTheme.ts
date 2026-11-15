/**
 * Builds shopify/sections/*.liquid from shopify/src/sections by injecting the
 * shared colour / font / spacing settings and the matching CSS-variable style
 * block into every section. Run: npm run build:theme
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export const COMMON_SETTINGS = [
  { type: 'header', content: 'Colours' },
  { type: 'color', id: 'color_bg', label: 'Background', default: '#ffffff' },
  { type: 'color', id: 'color_text', label: 'Text', default: '#121212' },
  { type: 'color', id: 'color_accent', label: 'Accent', default: '#334fb4' },
  { type: 'color', id: 'color_button', label: 'Button', default: '#121212' },
  { type: 'color', id: 'color_button_text', label: 'Button text', default: '#ffffff' },
  { type: 'header', content: 'Typography' },
  { type: 'font_picker', id: 'heading_font', label: 'Heading font', default: 'assistant_n4' },
  { type: 'font_picker', id: 'body_font', label: 'Body font', default: 'assistant_n4' },
  { type: 'range', id: 'heading_scale', label: 'Heading size', min: 80, max: 140, step: 5, unit: '%', default: 100 },
  { type: 'header', content: 'Spacing & shape' },
  { type: 'range', id: 'radius', label: 'Corner radius', min: 0, max: 40, step: 2, unit: 'px', default: 8 },
  { type: 'range', id: 'padding_top', label: 'Top padding', min: 0, max: 120, step: 4, unit: 'px', default: 56 },
  { type: 'range', id: 'padding_bottom', label: 'Bottom padding', min: 0, max: 120, step: 4, unit: 'px', default: 56 },
];

const STYLE = `{%- style -%}
{{ section.settings.heading_font | font_face: font_display: 'swap' }}
{{ section.settings.body_font | font_face: font_display: 'swap' }}
#lp-{{ section.id }}{--lp-bg:{{ section.settings.color_bg }};--lp-fg:{{ section.settings.color_text }};--lp-accent:{{ section.settings.color_accent }};--lp-btn:{{ section.settings.color_button }};--lp-btn-fg:{{ section.settings.color_button_text }};--lp-hf:{{ section.settings.heading_font.family }},{{ section.settings.heading_font.fallback_families }};--lp-hw:{{ section.settings.heading_font.weight }};--lp-hs:{{ section.settings.heading_font.style }};--lp-bf:{{ section.settings.body_font.family }},{{ section.settings.body_font.fallback_families }};--lp-bw:{{ section.settings.body_font.weight }};--lp-radius:{{ section.settings.radius }}px;--lp-pt:{{ section.settings.padding_top }}px;--lp-pb:{{ section.settings.padding_bottom }}px;--lp-h-scale:{{ section.settings.heading_scale | divided_by: 100.0 }}}
{%- endstyle -%}`;

export function buildTheme() {
  const src = path.join(config.shopifyDir, 'src', 'sections');
  const out = path.join(config.shopifyDir, 'sections');
  fs.mkdirSync(out, { recursive: true });
  const common = COMMON_SETTINGS.map((s) => JSON.stringify(s)).join(',\n    ');
  const built: string[] = [];
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.liquid'))) {
    let s = fs.readFileSync(path.join(src, f), 'utf8');
    s = s.replace('__STYLE__', STYLE).replace('"__COMMON__"', common);
    const schema = s.match(/{% schema %}([\s\S]*?){% endschema %}/)?.[1];
    JSON.parse(schema!); // fail loudly on invalid schema JSON
    fs.writeFileSync(path.join(out, f), s);
    built.push(f);
  }
  return built;
}

if (process.argv[1]?.endsWith('buildTheme.ts')) console.log('built', buildTheme());
