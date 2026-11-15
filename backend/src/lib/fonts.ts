/**
 * Mapping from web fonts to the Shopify font library (font_picker handles).
 * Only families known to exist in Shopify's library are listed; anything else is
 * mapped by classification (geometric sans, humanist sans, serif, display ...).
 * Publishing re-validates and falls back to assistant_n4 if Shopify rejects a handle.
 */
type Lib = { family: string; handle: string; cls: 'sans-geo' | 'sans-hum' | 'sans-grot' | 'serif' | 'serif-display' | 'condensed' | 'mono'; weights: number[]; google?: string };

export const SHOPIFY_FONTS: Lib[] = [
  { family: 'Assistant', handle: 'assistant', cls: 'sans-hum', weights: [400, 700], google: 'Assistant' },
  { family: 'Helvetica', handle: 'helvetica', cls: 'sans-grot', weights: [400, 700] },
  { family: 'Futura', handle: 'futura', cls: 'sans-geo', weights: [400, 700] },
  { family: 'Avenir Next', handle: 'avenir_next', cls: 'sans-geo', weights: [400, 700] },
  { family: 'Inter', handle: 'inter', cls: 'sans-grot', weights: [400, 700], google: 'Inter' },
  { family: 'Roboto', handle: 'roboto', cls: 'sans-grot', weights: [400, 700], google: 'Roboto' },
  { family: 'Open Sans', handle: 'open_sans', cls: 'sans-hum', weights: [400, 700], google: 'Open Sans' },
  { family: 'Lato', handle: 'lato', cls: 'sans-hum', weights: [400, 700], google: 'Lato' },
  { family: 'Montserrat', handle: 'montserrat', cls: 'sans-geo', weights: [400, 700], google: 'Montserrat' },
  { family: 'Poppins', handle: 'poppins', cls: 'sans-geo', weights: [400, 700], google: 'Poppins' },
  { family: 'Work Sans', handle: 'work_sans', cls: 'sans-grot', weights: [400, 700], google: 'Work Sans' },
  { family: 'DM Sans', handle: 'dm_sans', cls: 'sans-geo', weights: [400, 700], google: 'DM Sans' },
  { family: 'Jost', handle: 'jost', cls: 'sans-geo', weights: [400, 700], google: 'Jost' },
  { family: 'Josefin Sans', handle: 'josefin_sans', cls: 'sans-geo', weights: [400, 700], google: 'Josefin Sans' },
  { family: 'Karla', handle: 'karla', cls: 'sans-grot', weights: [400, 700], google: 'Karla' },
  { family: 'Rubik', handle: 'rubik', cls: 'sans-geo', weights: [400, 700], google: 'Rubik' },
  { family: 'Nunito Sans', handle: 'nunito_sans', cls: 'sans-hum', weights: [400, 700], google: 'Nunito Sans' },
  { family: 'Archivo', handle: 'archivo', cls: 'sans-grot', weights: [400, 700], google: 'Archivo' },
  { family: 'Chivo', handle: 'chivo', cls: 'sans-grot', weights: [400, 700], google: 'Chivo' },
  { family: 'Oswald', handle: 'oswald', cls: 'condensed', weights: [400, 700], google: 'Oswald' },
  { family: 'Playfair Display', handle: 'playfair_display', cls: 'serif-display', weights: [400, 700], google: 'Playfair Display' },
  { family: 'Lora', handle: 'lora', cls: 'serif', weights: [400, 700], google: 'Lora' },
  { family: 'Libre Baskerville', handle: 'libre_baskerville', cls: 'serif', weights: [400, 700], google: 'Libre Baskerville' },
  { family: 'Crimson Text', handle: 'crimson_text', cls: 'serif', weights: [400, 700], google: 'Crimson Text' },
  { family: 'Old Standard TT', handle: 'old_standard_tt', cls: 'serif-display', weights: [400, 700], google: 'Old Standard TT' },
];

const ALIASES: Record<string, string> = {
  'helvetica neue': 'helvetica', arial: 'helvetica', 'sf pro': 'inter', 'sf pro display': 'inter', '-apple-system': 'inter', 'system-ui': 'inter',
  'segoe ui': 'open_sans', 'source sans pro': 'open_sans', 'source sans 3': 'open_sans', 'noto sans': 'open_sans', 'pt sans': 'open_sans',
  'nunito': 'nunito_sans', mulish: 'nunito_sans', muli: 'nunito_sans', manrope: 'dm_sans', outfit: 'poppins', urbanist: 'poppins', 'plus jakarta sans': 'dm_sans',
  'space grotesk': 'archivo', 'neue haas': 'helvetica', 'gt walsheim': 'dm_sans', 'circular': 'dm_sans', gilroy: 'montserrat', 'proxima nova': 'montserrat',
  'futura pt': 'futura', 'century gothic': 'futura', 'avenir': 'avenir_next', 'raleway': 'josefin_sans', 'barlow': 'archivo', 'figtree': 'dm_sans',
  'bebas neue': 'oswald', anton: 'oswald', 'roboto condensed': 'oswald', 'league gothic': 'oswald',
  'cormorant': 'playfair_display', 'cormorant garamond': 'playfair_display', 'bodoni moda': 'playfair_display', 'didot': 'playfair_display', 'dm serif display': 'playfair_display',
  'eb garamond': 'crimson_text', garamond: 'crimson_text', georgia: 'libre_baskerville', 'times new roman': 'libre_baskerville', merriweather: 'libre_baskerville', 'pt serif': 'lora',
};

function classify(family: string, stack: string): Lib['cls'] {
  const s = (family + ' ' + stack).toLowerCase();
  if (/mono|code/.test(s)) return 'mono';
  if (/condensed|narrow|bebas|anton|oswald|gothic/.test(s)) return 'condensed';
  if (/display|didot|bodoni|playfair/.test(s)) return 'serif-display';
  if (/serif/.test(s) && !/sans/.test(s)) return 'serif';
  if (/futura|poppins|montserrat|geometric|circular|gilroy/.test(s)) return 'sans-geo';
  return 'sans-hum';
}

export function mapToShopifyFont(stack: string, weight: number) {
  const families = stack.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const primary = families[0] || 'sans-serif';
  let lib: Lib | undefined;
  let how = 'exact';
  for (const f of families) {
    const key = f.toLowerCase();
    lib = SHOPIFY_FONTS.find((x) => x.family.toLowerCase() === key) || SHOPIFY_FONTS.find((x) => x.handle === ALIASES[key]);
    if (lib) { if (lib.family.toLowerCase() !== key) how = `alias (${f} → ${lib.family})`; break; }
  }
  if (!lib) {
    const cls = classify(primary, stack); how = `closest by classification (${cls})`;
    lib = SHOPIFY_FONTS.find((x) => x.cls === cls) || SHOPIFY_FONTS[0];
  }
  const w = weight >= 600 ? 700 : 400;
  const handle = `${lib.handle}_n${w / 100}`;
  const fallbackStack = /serif/.test(lib.cls) ? 'Georgia, serif' : 'system-ui, -apple-system, sans-serif';
  return { family: lib.family, handle, how, original: primary, fallbackStack };
}

export function fontByHandle(handle: string) {
  const [base, nw] = handle.split(/_(?=[ni]\d$)/);
  const lib = SHOPIFY_FONTS.find((x) => x.handle === base) || SHOPIFY_FONTS[0];
  return { ...lib, weight: (Number(nw?.[1]) || 4) * 100, style: nw?.[0] === 'i' ? 'italic' : 'normal' };
}
