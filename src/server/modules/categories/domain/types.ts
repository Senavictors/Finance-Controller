// Tipos de domínio de categorias. Literais de string compatíveis com os enums do Prisma
// (`CategoryType`, `Nature`), mas sem importar o cliente: `domain/` é puro (ADR-025).

export const CATEGORY_TYPES = ['INCOME', 'EXPENSE'] as const
export type CategoryType = (typeof CATEGORY_TYPES)[number]

export const NATURES = ['MUST', 'NEED', 'WANT'] as const
export type Nature = (typeof NATURES)[number]

/** Chaves de cor: tokens `--fc-cat-1..10` (nunca hex). */
export const COLOR_KEYS = [
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
export type ColorKey = (typeof COLOR_KEYS)[number]

/** Linha de categoria como o domínio a enxerga (independente do Prisma). */
export type CategoryRecord = {
  id: string
  userId: string
  key: string
  name: string
  type: CategoryType
  nature: Nature | null
  icon: string | null
  colorKey: string | null
  parentId: string | null
  sortOrder: number
  isSystem: boolean
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}

/** Nó da árvore devolvida pela API de leitura. */
export type CategoryNode = Omit<CategoryRecord, 'userId' | 'createdAt' | 'updatedAt'> & {
  effectiveNature: Nature | null
  children: CategoryNode[]
}
