export type BrandCategory = 'bank' | 'network' | 'payment' | 'subscription'

export type BrandAssetKind = 'svg' | 'png' | 'jpeg'

export type BrandAsset = {
  src: string
  kind: BrandAssetKind
  fit?: 'contain' | 'cover'
  padding?: number
  border?: boolean
}

export type Brand = {
  key: string
  name: string
  category: BrandCategory
  bg: string
  fg: string
  border?: boolean
  asset?: BrandAsset
  svg?: string
}

const RASTER_DEFAULT = {
  fit: 'contain' as const,
  padding: 0,
  border: true,
}

export const BRANDS: Record<string, Brand> = {
  // ── Bancos ─────────────────────────────────────────────
  bb: {
    key: 'bb',
    name: 'Banco do Brasil',
    category: 'bank',
    bg: '#fff',
    fg: '#0033A0',
    border: true,
    asset: { src: '/brands/bb.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  itau: {
    key: 'itau',
    name: 'Itau',
    category: 'bank',
    bg: '#fff',
    fg: '#002D72',
    border: true,
    asset: { src: '/brands/itau.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  bradesco: {
    key: 'bradesco',
    name: 'Bradesco',
    category: 'bank',
    bg: '#fff',
    fg: '#CC092F',
    border: true,
    asset: { src: '/brands/bradesco.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  caixa: {
    key: 'caixa',
    name: 'Caixa',
    category: 'bank',
    bg: '#fff',
    fg: '#005CA9',
    border: true,
    asset: { src: '/brands/caixa.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  santander: {
    key: 'santander',
    name: 'Santander',
    category: 'bank',
    bg: '#fff',
    fg: '#EC0000',
    border: true,
    asset: { src: '/brands/santander.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  nubank: {
    key: 'nubank',
    name: 'Nubank',
    category: 'bank',
    bg: '#fff',
    fg: '#8A05BE',
    border: true,
    asset: { src: '/brands/nubank.png', kind: 'png', ...RASTER_DEFAULT },
  },
  inter: {
    key: 'inter',
    name: 'Banco Inter',
    category: 'bank',
    bg: '#fff',
    fg: '#FF7A00',
    border: true,
    asset: { src: '/brands/inter.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  c6: {
    key: 'c6',
    name: 'C6 Bank',
    category: 'bank',
    bg: '#fff',
    fg: '#111',
    border: true,
    asset: { src: '/brands/c6.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  neon: {
    key: 'neon',
    name: 'Neon',
    category: 'bank',
    bg: '#22D172',
    fg: '#0A2540',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="32" font-weight="800" fill="#0A2540">neon</text>',
  },
  pagbank: {
    key: 'pagbank',
    name: 'PagBank',
    category: 'bank',
    bg: '#fff',
    fg: '#007A4D',
    border: true,
    asset: { src: '/brands/pagbank.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  original: {
    key: 'original',
    name: 'Original',
    category: 'bank',
    bg: '#fff',
    fg: '#00995D',
    border: true,
    asset: { src: '/brands/original.png', kind: 'png', ...RASTER_DEFAULT },
  },
  btg: {
    key: 'btg',
    name: 'BTG Pactual',
    category: 'bank',
    bg: '#fff',
    fg: '#002776',
    border: true,
    asset: { src: '/brands/btg.png', kind: 'png', ...RASTER_DEFAULT },
  },
  sofisa: {
    key: 'sofisa',
    name: 'Sofisa Direto',
    category: 'bank',
    bg: '#fff',
    fg: '#E30613',
    border: true,
    asset: { src: '/brands/sofisa.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },

  // ── Bandeiras ──────────────────────────────────────────
  visa: {
    key: 'visa',
    name: 'Visa',
    category: 'network',
    bg: '#fff',
    fg: '#1A1F71',
    border: true,
    asset: { src: '/brands/visa.png', kind: 'png', ...RASTER_DEFAULT },
  },
  mastercard: {
    key: 'mastercard',
    name: 'Mastercard',
    category: 'network',
    bg: '#fff',
    fg: '#000',
    border: true,
    asset: { src: '/brands/mastercard.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  elo: {
    key: 'elo',
    name: 'Elo',
    category: 'network',
    bg: '#fff',
    fg: '#000',
    border: true,
    asset: { src: '/brands/elo.png', kind: 'png', ...RASTER_DEFAULT },
  },
  amex: {
    key: 'amex',
    name: 'American Express',
    category: 'network',
    bg: '#fff',
    fg: '#2E77BC',
    border: true,
    asset: { src: '/brands/amex.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  hipercard: {
    key: 'hipercard',
    name: 'Hipercard',
    category: 'network',
    bg: '#fff',
    fg: '#B3131B',
    border: true,
    asset: { src: '/brands/hipercard.png', kind: 'png', ...RASTER_DEFAULT },
  },

  // ── Pagamentos ─────────────────────────────────────────
  pix: {
    key: 'pix',
    name: 'Pix',
    category: 'payment',
    bg: '#32BCAD',
    fg: '#fff',
    svg: '<g transform="translate(50 50) rotate(45)"><rect x="-18" y="-18" width="36" height="36" rx="6" fill="none" stroke="#fff" stroke-width="6"/><rect x="-6" y="-6" width="12" height="12" fill="#fff"/></g>',
  },
  paypal: {
    key: 'paypal',
    name: 'PayPal',
    category: 'payment',
    bg: '#fff',
    fg: '#003087',
    border: true,
    asset: { src: '/brands/paypal.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },

  // ── Streaming / Assinaturas ────────────────────────────
  netflix: {
    key: 'netflix',
    name: 'Netflix',
    category: 'subscription',
    bg: '#fff',
    fg: '#E50914',
    border: true,
    asset: { src: '/brands/netflix.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  primevideo: {
    key: 'primevideo',
    name: 'Amazon Prime Video',
    category: 'subscription',
    bg: '#fff',
    fg: '#00A8E1',
    border: true,
    asset: { src: '/brands/primevideo.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  disneyplus: {
    key: 'disneyplus',
    name: 'Disney+',
    category: 'subscription',
    bg: '#fff',
    fg: '#0E1E3D',
    border: true,
    asset: { src: '/brands/disneyplus.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  hbomax: {
    key: 'hbomax',
    name: 'HBO Max',
    category: 'subscription',
    bg: '#fff',
    fg: '#000',
    border: true,
    asset: { src: '/brands/hbomax.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  spotify: {
    key: 'spotify',
    name: 'Spotify',
    category: 'subscription',
    bg: '#fff',
    fg: '#1DB954',
    border: true,
    asset: { src: '/brands/spotify.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  googleone: {
    key: 'googleone',
    name: 'Google One',
    category: 'subscription',
    bg: '#fff',
    fg: '#000',
    border: true,
    asset: { src: '/brands/googleone.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  icloud: {
    key: 'icloud',
    name: 'iCloud',
    category: 'subscription',
    bg: '#fff',
    fg: '#0A2540',
    border: true,
    asset: { src: '/brands/icloud.png', kind: 'png', ...RASTER_DEFAULT },
  },
  ms365: {
    key: 'ms365',
    name: 'Microsoft 365',
    category: 'subscription',
    bg: '#fff',
    fg: '#000',
    border: true,
    asset: { src: '/brands/ms365.png', kind: 'png', ...RASTER_DEFAULT },
  },
  adobe: {
    key: 'adobe',
    name: 'Adobe Creative Cloud',
    category: 'subscription',
    bg: '#fff',
    fg: '#FA0F00',
    border: true,
    asset: { src: '/brands/adobe.png', kind: 'png', ...RASTER_DEFAULT },
  },
  canva: {
    key: 'canva',
    name: 'Canva',
    category: 'subscription',
    bg: '#fff',
    fg: '#00C4CC',
    border: true,
    asset: { src: '/brands/canva.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  youtube: {
    key: 'youtube',
    name: 'YouTube Premium',
    category: 'subscription',
    bg: '#fff',
    fg: '#FF0000',
    border: true,
    asset: { src: '/brands/youtube.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  globoplay: {
    key: 'globoplay',
    name: 'Globoplay',
    category: 'subscription',
    bg: '#fff',
    fg: '#FB3636',
    border: true,
    asset: { src: '/brands/globoplay.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  deezer: {
    key: 'deezer',
    name: 'Deezer',
    category: 'subscription',
    bg: '#fff',
    fg: '#A238FF',
    border: true,
    asset: { src: '/brands/deezer.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  applemusic: {
    key: 'applemusic',
    name: 'Apple Music',
    category: 'subscription',
    bg: '#fff',
    fg: '#FA57C1',
    border: true,
    asset: { src: '/brands/applemusic.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
  paramount: {
    key: 'paramount',
    name: 'Paramount+',
    category: 'subscription',
    bg: '#fff',
    fg: '#0064FF',
    border: true,
    asset: { src: '/brands/paramount.jpeg', kind: 'jpeg', ...RASTER_DEFAULT },
  },
}

export function getBrand(key: string | null | undefined): Brand | null {
  if (!key) return null
  return BRANDS[key] ?? null
}

export function listBrands(category?: BrandCategory): Brand[] {
  const all = Object.values(BRANDS)
  return category ? all.filter((b) => b.category === category) : all
}

const MATCH_TABLE: Array<[string, string]> = [
  ['nubank', 'nubank'],
  ['nu pagamentos', 'nubank'],
  ['itaucard', 'itau'],
  ['itau', 'itau'],
  ['bradesco', 'bradesco'],
  ['caixa', 'caixa'],
  ['cef', 'caixa'],
  ['santander', 'santander'],
  ['banco do brasil', 'bb'],
  [' bb ', 'bb'],
  ['banco inter', 'inter'],
  ['inter ', 'inter'],
  ['c6', 'c6'],
  ['neon', 'neon'],
  ['pagbank', 'pagbank'],
  ['pagseguro', 'pagbank'],
  ['original', 'original'],
  ['btg', 'btg'],
  ['sofisa', 'sofisa'],
  ['visa', 'visa'],
  ['mastercard', 'mastercard'],
  ['master ', 'mastercard'],
  ['elo ', 'elo'],
  ['amex', 'amex'],
  ['american express', 'amex'],
  ['hipercard', 'hipercard'],
  ['pix', 'pix'],
  ['paypal', 'paypal'],
  ['netflix', 'netflix'],
  ['prime video', 'primevideo'],
  ['amazon prime', 'primevideo'],
  ['disney', 'disneyplus'],
  ['hbo', 'hbomax'],
  ['max ', 'hbomax'],
  ['spotify', 'spotify'],
  ['google one', 'googleone'],
  ['icloud', 'icloud'],
  ['apple storage', 'icloud'],
  ['microsoft 365', 'ms365'],
  ['office 365', 'ms365'],
  ['microsoft', 'ms365'],
  ['adobe', 'adobe'],
  ['canva', 'canva'],
  ['youtube premium', 'youtube'],
  ['youtube', 'youtube'],
  ['globoplay', 'globoplay'],
  ['deezer', 'deezer'],
  ['apple music', 'applemusic'],
  ['paramount', 'paramount'],
]

export function matchBrand(text: string | null | undefined): string | null {
  if (!text) return null
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const padded = ` ${normalized} `
  for (const [needle, key] of MATCH_TABLE) {
    if (padded.includes(needle)) return key
  }
  return null
}

export function resolveBrand(
  preferredKey: string | null | undefined,
  fallbackText?: string | null,
): Brand | null {
  const direct = getBrand(preferredKey)
  if (direct) return direct
  const inferred = matchBrand(fallbackText)
  return getBrand(inferred)
}
