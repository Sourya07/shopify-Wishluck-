export type Variant = {
  id: number; title: string; price: number; compareAtPrice: number | null; available: boolean;
  options: string[]; sku?: string | null; imageSrc?: string | null;
};
export type ProductImage = { src: string; alt: string; width?: number; height?: number };
export type Spec = { label: string; value: string };
export type Review = { author: string; rating: number | null; body: string; title?: string };

export type Product = {
  url: string; origin: string; handle: string; id: number | null;
  title: string; vendor: string; productType: string; tags: string[];
  currency: string; price: number; compareAtPrice: number | null; available: boolean;
  options: { name: string; values: string[] }[];
  variants: Variant[]; images: ProductImage[];
  descriptionHtml: string; descriptionText: string; specs: Spec[];
  rating: { value: number; count: number } | null; reviews: Review[];
  collection: { handle: string; title: string } | null;
  policies: { cod: string | null; returns: string | null; delivery: string | null; shipping: string | null };
  keywords: string[];
};

export type FontInfo = { family: string; weight: number; sizePx: number; shopifyHandle: string; fallbackStack: string };
export type Brand = {
  brandName: string;
  colors: { primary: string; secondary: string; background: string; text: string; button: string; buttonText: string; accent: string };
  palette: { hex: string; share: number }[];
  fonts: { heading: FontInfo; body: FontInfo };
  style: {
    tone: string; toneNotes: string; imageStyle: string;
    buttonStyle: 'pill' | 'rounded' | 'square'; buttonOutline: boolean;
    radius: number; spacing: 'compact' | 'comfortable' | 'airy';
  };
  evidence: Record<string, string>;
  screenshot?: string | null;
  confirmed?: boolean;
};

export type CompetitorFeatures = {
  sectionOrder: string[];
  headlineStyle: 'benefit' | 'product-name' | 'question' | 'offer' | 'other';
  headlineWords: number;
  priceShowsCompareAt: boolean; showsDiscountPct: boolean;
  reviewsNearPrice: boolean; hasReviewsSection: boolean; hasRatingStars: boolean;
  trustBadges: boolean; guarantee: boolean; codMentioned: boolean; returnsMentioned: boolean; deliveryEstimate: boolean;
  atcAboveFoldMobile: boolean; atcAboveFoldDesktop: boolean; stickyAtcMobile: boolean; repeatedAtc: boolean;
  hasFaq: boolean; faqCount: number; hasVideo: boolean; imageCount: number; hasSizeGuide: boolean;
  urgency: boolean; bundleOffer: boolean; hasSpecsTable: boolean; hasComparison: boolean; ugcImages: boolean;
  unusual: string[];
};
export type Competitor = {
  url: string; domain: string; title: string; reason: string; source: string; indianD2C: boolean;
  status: 'pending' | 'ok' | 'blocked' | 'error'; error?: string;
  screenshots?: { desktop?: string; mobile?: string };
  features?: CompetitorFeatures; isShopify?: boolean;
};
export type Learning = { id: string; statement: string; count: number; total: number; sources: string[]; category?: string; strength: number };

export type SectionKey =
  | 'hero' | 'trust_bar' | 'story' | 'benefits' | 'specs' | 'comparison' | 'reviews'
  | 'gallery' | 'offer' | 'faq' | 'cta' | 'in_box' | 'how_to' | 'sticky_atc';

export type Fingerprint = {
  direction: string; heroType: string; sectionOrder: SectionKey[];
  colorMode: 'light' | 'dark' | 'tint' | 'bold';
  atcPlacement: string; density: 'compact' | 'comfortable' | 'airy';
  typeScale: 'editorial' | 'standard' | 'compact'; imageTreatment: string; benefitLayout: string; faqStyle: string;
};
export type DesignSpec = Fingerprint & { name: string; tagline: string; appliedLearnings: string[] };
