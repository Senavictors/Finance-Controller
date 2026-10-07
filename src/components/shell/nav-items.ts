/**
 * Fonte única da navegação do app (ADR-017): 4 destinos na tab bar, o `+` central
 * (captura global, nunca navega) e `Mais` fora da tab bar.
 */

export type NavIconName = 'Sun' | 'ReceiptText' | 'Plus' | 'Target' | 'CreditCard' | 'Menu'

export const TAB_ITEMS = [
  { key: 'hoje', href: '/hoje', label: 'Hoje', icon: 'Sun' },
  { key: 'lancamentos', href: '/lancamentos', label: 'Lançamentos', icon: 'ReceiptText' },
  // FAB central: abre o sheet de captura, não navega.
  { key: 'capturar', href: null, label: 'Novo', icon: 'Plus' },
  { key: 'planejar', href: '/planejar', label: 'Planejar', icon: 'Target' },
  { key: 'cartoes', href: '/cartoes', label: 'Cartões', icon: 'CreditCard' },
] as const

export const MORE_ITEM = { key: 'mais', href: '/mais', label: 'Mais', icon: 'Menu' } as const

export type TabItem = (typeof TAB_ITEMS)[number]
export type TabKey = TabItem['key']
/** Chaves de destino navegável (o `+` não é um destino). */
export type NavKey = Exclude<TabKey, 'capturar'> | typeof MORE_ITEM.key

const NAV_DESTINATIONS: ReadonlyArray<{ key: NavKey; href: string }> = [
  ...TAB_ITEMS.flatMap((item) => (item.href ? [{ key: item.key as NavKey, href: item.href }] : [])),
  { key: MORE_ITEM.key, href: MORE_ITEM.href },
]

/**
 * Destino ativo para um pathname, por segmento: `/hoje/x` => `hoje`, `/hojexyz` => null.
 * Rotas fora do app (`/login`, `/`) devolvem null.
 */
export function activeTabKey(pathname: string): NavKey | null {
  const match = NAV_DESTINATIONS.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )
  return match?.key ?? null
}
