'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { CategoryStats } from './category-stats'
import { CategoryListCard } from './category-list-card'

type Category = {
  id: string
  name: string
  type: string
  icon: string | null
  color: string | null
  parentId: string | null
  _count: { children: number; transactions: number }
}

export function CategoriesContent({ categories }: { categories: Category[] }) {
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return categories

    const matchingIds = new Set<string>()

    for (const cat of categories) {
      if (cat.name.toLowerCase().includes(q)) {
        matchingIds.add(cat.id)
        // Se for filho, inclui o pai também
        if (cat.parentId) matchingIds.add(cat.parentId)
      }
    }

    // Se o pai foi incluído por ter um filho que bate, inclui todos os filhos desse pai
    for (const cat of categories) {
      if (cat.parentId && matchingIds.has(cat.parentId)) {
        matchingIds.add(cat.id)
      }
    }

    return categories.filter((c) => matchingIds.has(c.id))
  }, [categories, searchQuery])

  const incomeCategories = filtered.filter((c) => c.type === 'INCOME')
  const expenseCategories = filtered.filter((c) => c.type === 'EXPENSE')

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Buscar categorias"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <CategoryStats categories={categories} />

      {/* Section cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryListCard
          categories={incomeCategories}
          allCategories={categories}
          sectionType="INCOME"
          dialogTitle="Todas as categorias de receita"
        />
        <CategoryListCard
          categories={expenseCategories}
          allCategories={categories}
          sectionType="EXPENSE"
          dialogTitle="Todas as categorias de despesa"
        />
      </div>
    </div>
  )
}
