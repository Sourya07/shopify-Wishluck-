/** Maps a product to a normalised category + group so memory is shared between similar products. */
import type { Product } from '../types.js';

const RULES: [string, string, RegExp][] = [
  ['t-shirts', 'clothing', /\b(t-?shirts?|tees?|polo)\b/],
  ['shirts', 'clothing', /\bshirts?\b/],
  ['hoodies', 'clothing', /\b(hoodies?|sweatshirts?|jackets?)\b/],
  ['bottoms', 'clothing', /\b(jeans|trousers?|joggers?|shorts|pants|chinos|cargos?)\b/],
  ['dresses', 'clothing', /\b(dress(es)?|kurtas?|kurtis?|sarees?|co-?ords?|tops?)\b/],
  ['footwear', 'footwear', /\b(shoes?|sneakers?|sandals?|slides?|slippers?|boots?|loafers?|heels)\b/],
  ['watches', 'accessories', /\b(watch(es)?|smartwatch)\b/],
  ['jewellery', 'accessories', /\b(rings?|earrings?|necklaces?|pendants?|bracelets?|chains?|jewel(le)?ry|anklets?)\b/],
  ['bags', 'accessories', /\b(bags?|backpacks?|wallets?|totes?|sling|duffel|luggage)\b/],
  ['eyewear', 'accessories', /\b(sunglasses|eyewear|glasses|frames)\b/],
  ['caps', 'accessories', /\b(caps?|hats?|beanies?|socks|belts?)\b/],
  ['audio', 'electronics', /\b(earbuds|earphones|headphones|speakers?|neckband|tws)\b/],
  ['gadgets', 'electronics', /\b(chargers?|power ?banks?|cables?|smart|gadgets?)\b/],
  ['skincare', 'beauty', /\b(serum|moisturi[sz]er|sunscreen|face ?wash|cleanser|cream|lotion|skincare)\b/],
  ['haircare', 'beauty', /\b(shampoo|conditioner|hair ?oil|hair)\b/],
  ['fragrance', 'beauty', /\b(perfume|fragrance|deodorant|attar|eau de)\b/],
  ['home', 'home', /\b(mugs?|bottles?|bedsheets?|cushions?|lamps?|decor|candles?|kitchen)\b/],
  ['food', 'food', /\b(coffee|tea|snacks?|protein|chocolate|granola|nuts)\b/],
];

export function categorize(p: Pick<Product, 'title' | 'productType' | 'tags'>) {
  const hay = `${p.productType} ${p.title} ${p.tags.join(' ')}`.toLowerCase();
  // product type is the strongest signal, so test it first
  for (const src of [p.productType.toLowerCase(), hay]) {
    for (const [cat, group, re] of RULES) if (re.test(src)) return { category: cat, group };
  }
  return { category: (p.productType || 'general').toLowerCase().slice(0, 30), group: 'general' };
}

export const CATEGORY_QUERY: Record<string, string> = {
  't-shirts': 'oversized t-shirt', shirts: 'casual shirt men', hoodies: 'hoodie', bottoms: 'cargo pants', dresses: 'women dress',
  footwear: 'sneakers', watches: 'watch', jewellery: 'demi fine jewellery', bags: 'backpack', eyewear: 'sunglasses', caps: 'cap',
  audio: 'wireless earbuds', gadgets: 'gadget', skincare: 'face serum', haircare: 'hair oil', fragrance: 'perfume', home: 'home decor', food: 'snacks',
};
