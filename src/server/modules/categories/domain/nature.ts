import type { CategoryType, Nature } from './types'

type NatureSubject = {
  type: CategoryType
  nature: Nature | null | undefined
  parentId?: string | null
}

/**
 * Natureza efetiva (RN-03): receita é sempre `null`; despesa usa a própria natureza ou herda a
 * do pai. Lança se o filho depende de um pai que não foi informado (dado inconsistente).
 * Despesa raiz sem natureza resulta em `null` (não ocorre nos padrões; tolerado para não
 * quebrar a leitura de dados antigos).
 */
export function resolveNature(
  category: NatureSubject,
  parent: { nature?: Nature | null } | null | undefined,
): Nature | null {
  if (category.type === 'INCOME') return null
  if (category.nature) return category.nature
  if (category.parentId) {
    if (!parent) {
      throw new Error('resolveNature: a categoria tem pai, mas o pai não foi informado')
    }
    return parent.nature ?? null
  }
  return null
}
