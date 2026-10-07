import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Tag } from 'lucide-react'

// Domínio puro da árvore padrão (sem infra/Prisma): só dados.
import { DEFAULT_CATEGORIES } from '@/server/modules/categories/domain/default-categories'

import {
  CATEGORY_ICONS,
  CATEGORY_ICON_ALIASES,
  CategoryIcon,
  resolveCategoryIcon,
} from './category-icon'

describe('CategoryIcon — cobertura das categorias padrão (FC2-F1-08)', () => {
  it('CA-01: todo `icon` de DEFAULT_CATEGORIES está mapeado em CATEGORY_ICONS', () => {
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0)
    const missing = DEFAULT_CATEGORIES.filter(
      (category) => !Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, category.icon),
    ).map((category) => `${category.key} -> ${category.icon}`)
    expect(missing).toEqual([])
  })

  it('CA-01: nenhuma categoria padrão cai no fallback por engano (tag só onde é `tag`)', () => {
    for (const category of DEFAULT_CATEGORIES) {
      const resolved = resolveCategoryIcon(category.icon)
      if (category.icon !== 'tag') expect(resolved).not.toBe(Tag)
    }
  })

  it('CA-02: aliases legados resolvem para um nome canônico existente', () => {
    for (const [alias, canonical] of Object.entries(CATEGORY_ICON_ALIASES)) {
      expect(Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, alias)).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, canonical)).toBe(true)
      expect(resolveCategoryIcon(alias)).toBe(
        CATEGORY_ICONS[canonical as keyof typeof CATEGORY_ICONS],
      )
    }
    expect(resolveCategoryIcon('home')).toBe(CATEGORY_ICONS.house)
    expect(resolveCategoryIcon('gamepad')).toBe(CATEGORY_ICONS['gamepad-2'])
  })

  it('fallback `tag` para chave desconhecida, vazia ou herdada de Object.prototype', () => {
    for (const name of ['inexistente', '', undefined, null, 'constructor', 'toString']) {
      expect(resolveCategoryIcon(name)).toBe(Tag)
    }
  })

  it('renderiza um svg decorativo (aria-hidden) com a cor da categoria', () => {
    const html = renderToStaticMarkup(
      createElement(CategoryIcon, { icon: 'house', colorKey: 'cat-8' }),
    )
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-color="cat-8"')
    expect(html).toContain('<svg')
  })
})
