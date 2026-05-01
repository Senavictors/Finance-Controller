'use client'

import { Layers, TrendingUp, TrendingDown, GitBranch } from 'lucide-react'

type Category = {
  id: string
  type: string
  parentId: string | null
}

export function CategoryStats({ categories }: { categories: Category[] }) {
  const parents = categories.filter((c) => !c.parentId)
  const children = categories.filter((c) => c.parentId)
  const incomeParents = parents.filter((c) => c.type === 'INCOME')
  const expenseParents = parents.filter((c) => c.type === 'EXPENSE')

  const stats = [
    {
      label: 'Total de categorias',
      value: categories.length,
      sublabel: `${parents.length} principais • ${children.length} subcategorias`,
      icon: Layers,
      iconClass: 'bg-blue-500/10 text-blue-500',
    },
    {
      label: 'Receitas',
      value: incomeParents.length,
      sublabel: 'Categorias principais',
      icon: TrendingUp,
      iconClass: 'bg-emerald-500/10 text-emerald-500',
    },
    {
      label: 'Despesas',
      value: expenseParents.length,
      sublabel: 'Categorias principais',
      icon: TrendingDown,
      iconClass: 'bg-red-500/10 text-red-500',
    },
    {
      label: 'Subcategorias',
      value: children.length,
      sublabel: 'Em receitas e despesas',
      icon: GitBranch,
      iconClass: 'bg-amber-500/10 text-amber-500',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-card border-border/50 rounded-2xl border p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className={`flex size-10 flex-shrink-0 items-center justify-center rounded-xl ${stat.iconClass}`}>
              <stat.icon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground truncate text-xs font-medium">{stat.label}</p>
              <p className="text-foreground text-2xl font-bold leading-tight">{stat.value}</p>
              <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{stat.sublabel}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
