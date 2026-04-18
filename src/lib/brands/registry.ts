export type BrandCategory = 'bank' | 'network' | 'payment' | 'subscription'

export type Brand = {
  key: string
  name: string
  category: BrandCategory
  bg: string
  fg: string
  border?: boolean
  svg: string
}

export const BRANDS: Record<string, Brand> = {
  // ── Bancos ─────────────────────────────────────────────
  bb: {
    key: 'bb',
    name: 'Banco do Brasil',
    category: 'bank',
    bg: '#FAE128',
    fg: '#0033A0',
    svg: '<text x="50%" y="58%" text-anchor="middle" font-family="Inter,sans-serif" font-size="48" font-weight="800" fill="#0033A0">bb</text>',
  },
  itau: {
    key: 'itau',
    name: 'Itau',
    category: 'bank',
    bg: '#EC7000',
    fg: '#002D72',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="40" font-weight="800" fill="#002D72">Itau</text>',
  },
  bradesco: {
    key: 'bradesco',
    name: 'Bradesco',
    category: 'bank',
    bg: '#CC092F',
    fg: '#fff',
    svg: '<path d="M50 22 L78 70 L22 70 Z" fill="#fff"/><circle cx="50" cy="58" r="10" fill="#CC092F"/>',
  },
  caixa: {
    key: 'caixa',
    name: 'Caixa',
    category: 'bank',
    bg: '#005CA9',
    fg: '#F39200',
    svg: '<text x="50%" y="60%" text-anchor="middle" font-family="Inter,sans-serif" font-size="26" font-weight="800" fill="#F39200">CAIXA</text>',
  },
  santander: {
    key: 'santander',
    name: 'Santander',
    category: 'bank',
    bg: '#EC0000',
    fg: '#fff',
    svg: '<path d="M30 30 Q50 22 70 30 Q78 50 70 70 Q50 78 30 70 Q22 50 30 30 Z" fill="none" stroke="#fff" stroke-width="6"/><path d="M42 52 L58 52" stroke="#fff" stroke-width="4"/>',
  },
  nubank: {
    key: 'nubank',
    name: 'Nubank',
    category: 'bank',
    bg: '#8A05BE',
    fg: '#fff',
    svg: '<path d="M35 28 Q35 65 55 72 Q55 50 45 40 Q45 62 58 68 M52 28 Q72 35 72 62" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>',
  },
  inter: {
    key: 'inter',
    name: 'Banco Inter',
    category: 'bank',
    bg: '#FF7A00',
    fg: '#fff',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="44" font-weight="800" fill="#fff">i</text>',
  },
  c6: {
    key: 'c6',
    name: 'C6 Bank',
    category: 'bank',
    bg: '#111',
    fg: '#D4AF37',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="40" font-weight="800" fill="#D4AF37">C6</text>',
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
    bg: '#007A4D',
    fg: '#fff',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="24" font-weight="700" fill="#fff">PagBank</text>',
  },
  original: {
    key: 'original',
    name: 'Original',
    category: 'bank',
    bg: '#00995D',
    fg: '#fff',
    svg: '<circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-width="5"/><circle cx="50" cy="50" r="8" fill="#fff"/>',
  },
  btg: {
    key: 'btg',
    name: 'BTG Pactual',
    category: 'bank',
    bg: '#002776',
    fg: '#fff',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="34" font-weight="800" fill="#fff">BTG</text>',
  },
  sofisa: {
    key: 'sofisa',
    name: 'Sofisa Direto',
    category: 'bank',
    bg: '#E30613',
    fg: '#fff',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="28" font-weight="800" fill="#fff">SOF</text>',
  },

  // ── Bandeiras ──────────────────────────────────────────
  visa: {
    key: 'visa',
    name: 'Visa',
    category: 'network',
    bg: '#1A1F71',
    fg: '#F7B600',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="30" font-weight="800" fill="#F7B600" letter-spacing="-1">VISA</text>',
  },
  mastercard: {
    key: 'mastercard',
    name: 'Mastercard',
    category: 'network',
    bg: '#fff',
    fg: '#000',
    border: true,
    svg: '<circle cx="42" cy="50" r="18" fill="#EB001B"/><circle cx="58" cy="50" r="18" fill="#F79E1B"/><path d="M50 36 Q56 44 56 50 Q56 56 50 64 Q44 56 44 50 Q44 44 50 36 Z" fill="#FF5F00"/>',
  },
  elo: {
    key: 'elo',
    name: 'Elo',
    category: 'network',
    bg: '#000',
    fg: '#fff',
    svg: '<circle cx="40" cy="50" r="10" fill="#FFCB05"/><circle cx="60" cy="50" r="10" fill="#EF4123"/><circle cx="50" cy="50" r="8" fill="#000"/>',
  },
  amex: {
    key: 'amex',
    name: 'American Express',
    category: 'network',
    bg: '#2E77BC',
    fg: '#fff',
    svg: '<text x="50%" y="46%" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="800" fill="#fff">AMERICAN</text><text x="50%" y="66%" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="800" fill="#fff">EXPRESS</text>',
  },
  hipercard: {
    key: 'hipercard',
    name: 'Hipercard',
    category: 'network',
    bg: '#B3131B',
    fg: '#fff',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="22" font-weight="800" fill="#fff">Hiper</text>',
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
    bg: '#003087',
    fg: '#009CDE',
    svg: '<text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="26" font-weight="800" fill="#009CDE">PayPal</text>',
  },

  // ── Streaming / Assinaturas ────────────────────────────
  netflix: {
    key: 'netflix',
    name: 'Netflix',
    category: 'subscription',
    bg: '#000',
    fg: '#E50914',
    svg: '<path d="M35 22 L35 78 L46 78 L46 48 L54 78 L65 78 L65 22 L54 22 L54 52 L46 22 Z" fill="#E50914"/>',
  },
  primevideo: {
    key: 'primevideo',
    name: 'Amazon Prime Video',
    category: 'subscription',
    bg: '#00A8E1',
    fg: '#fff',
    svg: '<text x="50%" y="45%" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="800" fill="#fff">prime</text><text x="50%" y="68%" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="600" fill="#fff">video</text>',
  },
  disneyplus: {
    key: 'disneyplus',
    name: 'Disney+',
    category: 'subscription',
    bg: '#0E1E3D',
    fg: '#fff',
    svg: '<text x="50%" y="60%" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-style="italic" font-weight="700" fill="#fff">Disney</text><text x="82%" y="48%" text-anchor="middle" font-family="Inter,sans-serif" font-size="22" font-weight="600" fill="#fff">+</text>',
  },
  hbomax: {
    key: 'hbomax',
    name: 'HBO Max',
    category: 'subscription',
    bg: '#000',
    fg: '#fff',
    svg: '<text x="50%" y="44%" text-anchor="middle" font-family="Inter,sans-serif" font-size="22" font-weight="800" fill="#fff">HBO</text><text x="50%" y="72%" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" font-weight="600" fill="#B026FF">Max</text>',
  },
  spotify: {
    key: 'spotify',
    name: 'Spotify',
    category: 'subscription',
    bg: '#1DB954',
    fg: '#fff',
    svg: '<circle cx="50" cy="50" r="26" fill="none" stroke="#fff" stroke-width="5"/><path d="M36 42 Q50 38 66 44 M38 52 Q50 48 62 54 M40 62 Q50 58 60 64" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>',
  },
  googleone: {
    key: 'googleone',
    name: 'Google One',
    category: 'subscription',
    bg: '#fff',
    fg: '#000',
    border: true,
    svg: '<path d="M70 50 a20 20 0 1 1 -6-14" stroke="#4285F4" stroke-width="6" fill="none"/><path d="M50 50 L70 50 L70 58 L58 58" stroke="#EA4335" stroke-width="6" fill="none"/><path d="M50 30 L50 46" stroke="#FBBC04" stroke-width="6"/><path d="M32 60 L42 60" stroke="#34A853" stroke-width="6"/>',
  },
  icloud: {
    key: 'icloud',
    name: 'iCloud',
    category: 'subscription',
    bg: '#fff',
    fg: '#0A2540',
    border: true,
    svg: '<path d="M30 62 Q24 62 24 54 Q24 46 32 46 Q34 36 46 36 Q58 36 60 46 Q70 46 70 54 Q70 62 64 62 Z" fill="#5AC8FA"/>',
  },
  ms365: {
    key: 'ms365',
    name: 'Microsoft 365',
    category: 'subscription',
    bg: '#fff',
    fg: '#000',
    border: true,
    svg: '<rect x="26" y="26" width="22" height="22" fill="#F25022"/><rect x="52" y="26" width="22" height="22" fill="#7FBA00"/><rect x="26" y="52" width="22" height="22" fill="#00A4EF"/><rect x="52" y="52" width="22" height="22" fill="#FFB900"/>',
  },
  adobe: {
    key: 'adobe',
    name: 'Adobe Creative Cloud',
    category: 'subscription',
    bg: '#FA0F00',
    fg: '#fff',
    svg: '<path d="M28 28 L48 28 L36 70 Z M72 28 L52 28 L64 70 Z M42 58 L58 58 L50 44 Z" fill="#fff"/>',
  },
  canva: {
    key: 'canva',
    name: 'Canva',
    category: 'subscription',
    bg: '#00C4CC',
    fg: '#fff',
    svg: '<circle cx="50" cy="50" r="24" fill="#fff"/><text x="50%" y="62%" text-anchor="middle" font-family="Inter,sans-serif" font-size="22" font-weight="700" fill="#00C4CC">C</text>',
  },
  youtube: {
    key: 'youtube',
    name: 'YouTube Premium',
    category: 'subscription',
    bg: '#FF0000',
    fg: '#fff',
    svg: '<rect x="22" y="32" width="56" height="36" rx="8" fill="#fff"/><path d="M44 42 L44 58 L60 50 Z" fill="#FF0000"/>',
  },
  globoplay: {
    key: 'globoplay',
    name: 'Globoplay',
    category: 'subscription',
    bg: '#FB3636',
    fg: '#fff',
    svg: '<circle cx="50" cy="50" r="20" fill="none" stroke="#fff" stroke-width="6"/><path d="M50 30 Q62 38 62 50 Q62 62 50 70" stroke="#fff" stroke-width="6" fill="none"/>',
  },
  deezer: {
    key: 'deezer',
    name: 'Deezer',
    category: 'subscription',
    bg: '#000',
    fg: '#A238FF',
    svg: '<rect x="20" y="58" width="12" height="8" fill="#40D9FF"/><rect x="34" y="58" width="12" height="8" fill="#A238FF"/><rect x="34" y="46" width="12" height="8" fill="#FF2EC2"/><rect x="48" y="58" width="12" height="8" fill="#FFA43B"/><rect x="48" y="46" width="12" height="8" fill="#FF5656"/><rect x="48" y="34" width="12" height="8" fill="#FFC900"/><rect x="62" y="58" width="12" height="8" fill="#EF5466"/><rect x="62" y="46" width="12" height="8" fill="#A238FF"/><rect x="62" y="34" width="12" height="8" fill="#40D9FF"/><rect x="62" y="22" width="12" height="8" fill="#fff"/>',
  },
  applemusic: {
    key: 'applemusic',
    name: 'Apple Music',
    category: 'subscription',
    bg: '#FA57C1',
    fg: '#fff',
    svg: '<path d="M40 66 Q34 66 34 60 Q34 54 42 54 Q46 54 48 56 L48 32 L66 28 L66 56 Q66 62 60 62 Q54 62 54 56 Q54 50 62 50 Q64 50 66 52" fill="none" stroke="#fff" stroke-width="4"/>',
  },
  paramount: {
    key: 'paramount',
    name: 'Paramount+',
    category: 'subscription',
    bg: '#0064FF',
    fg: '#fff',
    svg: '<path d="M50 24 L28 70 L42 70 L50 44 L58 70 L72 70 Z" fill="#fff"/>',
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
