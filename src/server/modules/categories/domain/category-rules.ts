import { CategoryError } from './errors'
import { resolveNature } from './nature'
import {
  COLOR_KEYS,
  NATURES,
  type CategoryNode,
  type CategoryRecord,
  type CategoryType,
  type ColorKey,
  type Nature,
} from './types'

export const CATEGORY_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const CATEGORY_NAME_MAX = 60
export const CUSTOM_KEY_PREFIX = 'custom-'
const CUSTOM_SLUG_MAX = 40
const DEFAULT_ICON = 'tag'
const DEFAULT_COLOR: ColorKey = 'cat-10'

export function isColorKey(value: string): value is ColorKey {
  return (COLOR_KEYS as readonly string[]).includes(value)
}

export function isNature(value: string): value is Nature {
  return (NATURES as readonly string[]).includes(value)
}

/** Nome de ícone lucide em kebab-case (a existência no pacote é checada em teste, não aqui). */
export function isIconName(value: string): boolean {
  return value.length <= 60 && CATEGORY_KEY_PATTERN.test(value)
}

export function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length === 0) {
    throw new CategoryError('CATEGORY_INVALID', 'Informe o nome da categoria.')
  }
  if (name.length > CATEGORY_NAME_MAX) {
    throw new CategoryError(
      'CATEGORY_INVALID',
      `O nome pode ter no máximo ${CATEGORY_NAME_MAX} caracteres.`,
    )
  }
  return name
}

/** Slug kebab-case ASCII a partir de um nome livre ("Feira & Mercado" -> "feira-mercado"). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CUSTOM_SLUG_MAX)
    .replace(/-+$/g, '')
}

/** `custom-<slug>` e, em colisão, `custom-<slug>-2`, `-3`... Nunca reutiliza uma key existente. */
export function generateCustomKey(name: string, existingKeys: ReadonlySet<string>): string {
  const base = `${CUSTOM_KEY_PREFIX}${slugify(name) || 'categoria'}`
  if (!existingKeys.has(base)) return base
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`
    if (!existingKeys.has(candidate)) return candidate
  }
}

export type CreateCategoryInput = {
  name: string
  type?: CategoryType
  parentId?: string | null
  nature?: Nature | null
  icon?: string
  colorKey?: string
}

export type NewCategoryData = {
  key: string
  name: string
  type: CategoryType
  nature: Nature | null
  icon: string
  colorKey: string
  parentId: string | null
  isSystem: false
}

/**
 * Valida e completa a criação de categoria (RN-02/03/06). `parent` é o registro do pai, quando
 * houver. Máximo de 2 níveis: o pai não pode ter pai. Filha herda tipo, ícone e cor do pai.
 */
export function planNewCategory(
  input: CreateCategoryInput,
  parent: CategoryRecord | null,
  existingKeys: ReadonlySet<string>,
): NewCategoryData {
  const name = normalizeName(input.name)

  let type: CategoryType
  if (parent) {
    if (parent.parentId) {
      throw new CategoryError(
        'CATEGORY_MAX_DEPTH',
        'Categorias têm no máximo 2 níveis: o pai escolhido já é uma subcategoria.',
      )
    }
    if (input.type && input.type !== parent.type) {
      throw new CategoryError('CATEGORY_INVALID', 'O tipo da subcategoria deve ser o do pai.')
    }
    type = parent.type
  } else {
    if (!input.type) {
      throw new CategoryError('CATEGORY_INVALID', 'Informe o tipo (receita ou despesa).')
    }
    type = input.type
  }

  const nature = planNature(type, input.nature ?? null, parent === null)

  const icon = input.icon ?? parent?.icon ?? DEFAULT_ICON
  if (!isIconName(icon)) {
    throw new CategoryError('CATEGORY_INVALID', 'Ícone inválido.')
  }
  const colorKey = input.colorKey ?? parent?.colorKey ?? DEFAULT_COLOR
  if (!isColorKey(colorKey)) {
    throw new CategoryError('CATEGORY_INVALID', 'Cor inválida: use cat-1 a cat-10.')
  }

  return {
    key: generateCustomKey(name, existingKeys),
    name,
    type,
    nature,
    icon,
    colorKey,
    parentId: parent?.id ?? null,
    isSystem: false,
  }
}

function planNature(type: CategoryType, nature: Nature | null, isRoot: boolean): Nature | null {
  if (type === 'INCOME') {
    if (nature) {
      throw new CategoryError('CATEGORY_INVALID', 'Receitas não têm natureza.')
    }
    return null
  }
  if (isRoot && !nature) {
    throw new CategoryError('CATEGORY_INVALID', 'Informe a natureza da categoria de despesa.')
  }
  return nature
}

export type UpdateCategoryPatch = {
  name?: string
  icon?: string
  colorKey?: string
  /** `null` em subcategoria volta a herdar do pai. */
  nature?: Nature | null
  isArchived?: boolean
  sortOrder?: number
  /** Imutáveis: aceitos só para responder com erro claro (RN-01/05). */
  key?: string
  type?: CategoryType
}

export type CategoryColumnsPatch = Partial<
  Pick<CategoryRecord, 'name' | 'icon' | 'colorKey' | 'nature' | 'isArchived' | 'sortOrder'>
>

/**
 * Aplica as regras de edição (RN-01/05) e devolve só as colunas a gravar.
 * - `key` nunca muda; `type` não muda; em categoria de sistema isso é `CATEGORY_SYSTEM_LOCKED`.
 * - Categoria de sistema não pode ser arquivada, mas pode ser renomeada.
 * - Natureza só em despesa; raiz de despesa não pode ficar sem natureza.
 */
export function planCategoryUpdate(
  category: CategoryRecord,
  patch: UpdateCategoryPatch,
): CategoryColumnsPatch {
  if (patch.key !== undefined && patch.key !== category.key) {
    throw category.isSystem
      ? new CategoryError(
          'CATEGORY_SYSTEM_LOCKED',
          'Categoria de sistema: a chave não pode ser alterada.',
        )
      : new CategoryError('CATEGORY_INVALID', 'A chave da categoria é imutável.')
  }
  if (patch.type !== undefined && patch.type !== category.type) {
    throw category.isSystem
      ? new CategoryError(
          'CATEGORY_SYSTEM_LOCKED',
          'Categoria de sistema: o tipo não pode ser alterado.',
        )
      : new CategoryError('CATEGORY_INVALID', 'O tipo da categoria não pode ser alterado.')
  }
  if (patch.isArchived === true && category.isSystem) {
    throw new CategoryError(
      'CATEGORY_SYSTEM_LOCKED',
      'Categoria de sistema não pode ser arquivada.',
    )
  }

  const columns: CategoryColumnsPatch = {}
  if (patch.name !== undefined) columns.name = normalizeName(patch.name)
  if (patch.icon !== undefined) {
    if (!isIconName(patch.icon)) throw new CategoryError('CATEGORY_INVALID', 'Ícone inválido.')
    columns.icon = patch.icon
  }
  if (patch.colorKey !== undefined) {
    if (!isColorKey(patch.colorKey)) {
      throw new CategoryError('CATEGORY_INVALID', 'Cor inválida: use cat-1 a cat-10.')
    }
    columns.colorKey = patch.colorKey
  }
  if (patch.nature !== undefined) {
    if (category.type === 'INCOME') {
      throw new CategoryError('CATEGORY_INVALID', 'Receitas não têm natureza.')
    }
    if (patch.nature === null && !category.parentId) {
      throw new CategoryError(
        'CATEGORY_INVALID',
        'Categoria de despesa sem pai precisa de natureza.',
      )
    }
    columns.nature = patch.nature
  }
  if (patch.isArchived !== undefined) columns.isArchived = patch.isArchived
  if (patch.sortOrder !== undefined) {
    if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0) {
      throw new CategoryError('CATEGORY_INVALID', 'A ordem deve ser um inteiro não negativo.')
    }
    columns.sortOrder = patch.sortOrder
  }
  return columns
}

/**
 * Projeta o registro no nó público: remove `userId` e datas (não vazam na API) e acrescenta
 * `effectiveNature`. Sem `parent` (raiz ou órfão) não há de quem herdar.
 */
export function toCategoryNode(
  record: CategoryRecord,
  parent: CategoryRecord | null,
  children: CategoryNode[] = [],
): CategoryNode {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    type: record.type,
    nature: record.nature,
    icon: record.icon,
    colorKey: record.colorKey,
    parentId: record.parentId,
    sortOrder: record.sortOrder,
    isSystem: record.isSystem,
    isArchived: record.isArchived,
    effectiveNature: resolveNature(
      { ...record, parentId: parent ? record.parentId : null },
      parent,
    ),
    children,
  }
}

function compareSiblings(a: CategoryRecord, b: CategoryRecord): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR')
}

/**
 * Árvore de 2 níveis ordenada por `sortOrder`, com `effectiveNature` em cada nó (RN-03).
 * Sem `includeArchived`, categorias arquivadas somem junto com seus filhos. Registros cujo pai
 * não está na lista (dado órfão) viram raízes.
 */
export function buildCategoryTree(
  records: readonly CategoryRecord[],
  options: { includeArchived?: boolean } = {},
): CategoryNode[] {
  const includeArchived = options.includeArchived ?? false
  const byId = new Map(records.map((record) => [record.id, record]))
  const childrenOf = new Map<string, CategoryRecord[]>()
  const roots: CategoryRecord[] = []

  for (const record of records) {
    if (record.parentId && byId.has(record.parentId)) {
      const siblings = childrenOf.get(record.parentId) ?? []
      siblings.push(record)
      childrenOf.set(record.parentId, siblings)
    } else {
      roots.push(record)
    }
  }

  const toNode = (record: CategoryRecord, parent: CategoryRecord | null): CategoryNode => {
    const children = (childrenOf.get(record.id) ?? [])
      .filter((child) => includeArchived || !child.isArchived)
      .sort(compareSiblings)
      .map((child) => toNode(child, record))
    // Órfão (pai ausente da lista) é tratado como raiz: não há de quem herdar.
    return toCategoryNode(record, parent, children)
  }

  return roots
    .filter((root) => includeArchived || !root.isArchived)
    .sort(compareSiblings)
    .map((root) => toNode(root, null))
}
