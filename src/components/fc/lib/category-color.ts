export const CATEGORY_COLOR_KEYS = [
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
  'cat-7',
  'cat-8',
  'cat-9',
  'cat-10',
] as const

export type CategoryColorKey = (typeof CATEGORY_COLOR_KEYS)[number]

/** Chave desconhecida cai em `cat-10` ("outros"). */
export const FALLBACK_CATEGORY_COLOR_KEY: CategoryColorKey = 'cat-10'

export function resolveCategoryColorKey(key: string | null | undefined): CategoryColorKey {
  const found = CATEGORY_COLOR_KEYS.find((candidate) => candidate === key)
  return found ?? FALLBACK_CATEGORY_COLOR_KEY
}
