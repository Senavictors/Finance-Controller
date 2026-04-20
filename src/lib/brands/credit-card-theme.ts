import type { CSSProperties } from 'react'

export type CreditCardBrandTheme = {
  brandKey: string
  primary: string
  secondary: string
  tertiary: string
}

const CREDIT_CARD_BRAND_THEMES: Record<string, Omit<CreditCardBrandTheme, 'brandKey'>> = {
  nubank: {
    primary: '#8A05BE',
    secondary: '#FFFFFF',
    tertiary: '#8A05BE',
  },
  itau: {
    primary: '#FF6200',
    secondary: '#000066',
    tertiary: '#FFFFFF',
  },
  bradesco: {
    primary: '#E1173F',
    secondary: '#FFFFFF',
    tertiary: '#014397',
  },
  bb: {
    primary: '#FCFC30',
    secondary: '#465FFF',
    tertiary: '#F4F4F6',
  },
  santander: {
    primary: '#EA1D25',
    secondary: '#000000',
    tertiary: '#EDEDED',
  },
  inter: {
    primary: '#FF6E07',
    secondary: '#FFFFFF',
    tertiary: '#161616',
  },
  c6: {
    primary: '#FFE45C',
    secondary: '#FFFFFF',
    tertiary: '#242429',
  },
  pagbank: {
    primary: '#F5DE3E',
    secondary: '#E4B9B9',
    tertiary: '#1BB99A',
  },
  original: {
    primary: '#00A857',
    secondary: '#FFFFFF',
    tertiary: '#1A1B1A',
  },
  btg: {
    primary: '#195AB4',
    secondary: '#05132A',
    tertiary: '#FFFFFF',
  },
  sofisa: {
    primary: '#00B398',
    secondary: '#00B398',
    tertiary: '#00B398',
  },
}

function normalizeHex(hex: string) {
  const value = hex.trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [r, g, b] = value.slice(1)
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return null
}

export function withOpacity(hex: string, opacity: number) {
  const normalized = normalizeHex(hex)
  if (!normalized) return hex
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
  return `${normalized}${alpha}`
}

export function getCreditCardBrandTheme(brandKey?: string | null): CreditCardBrandTheme | null {
  if (!brandKey) return null
  const theme = CREDIT_CARD_BRAND_THEMES[brandKey]
  if (!theme) return null
  return { brandKey, ...theme }
}

export function getCreditCardBrandSurfaceStyle(
  theme: CreditCardBrandTheme | null,
): CSSProperties | undefined {
  if (!theme) return undefined

  return {
    backgroundColor: 'var(--card)',
    backgroundImage: `linear-gradient(145deg, ${withOpacity(theme.primary, 0.22)} 0%, ${withOpacity(theme.secondary, 0.12)} 52%, ${withOpacity(theme.tertiary, 0.16)} 100%), linear-gradient(180deg, var(--card), var(--card))`,
    borderColor: withOpacity(theme.primary, 0.28),
    boxShadow: `0 20px 45px -34px ${withOpacity(theme.primary, 0.72)}`,
  }
}

export function getCreditCardBrandAccentStyle(
  theme: CreditCardBrandTheme | null,
): CSSProperties | undefined {
  if (!theme) return undefined

  return {
    backgroundImage: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.secondary} 58%, ${theme.tertiary} 100%)`,
  }
}

export function getCreditCardBrandGlowStyle(
  theme: CreditCardBrandTheme | null,
): CSSProperties | undefined {
  if (!theme) return undefined

  return {
    backgroundImage: `radial-gradient(circle, ${withOpacity(theme.primary, 0.32)} 0%, ${withOpacity(theme.secondary, 0.18)} 42%, transparent 72%)`,
  }
}

export function getCreditCardBrandChipStyle(
  theme: CreditCardBrandTheme | null,
): CSSProperties | undefined {
  if (!theme) return undefined

  return {
    backgroundColor: withOpacity(theme.primary, 0.14),
    borderColor: withOpacity(theme.primary, 0.24),
  }
}
