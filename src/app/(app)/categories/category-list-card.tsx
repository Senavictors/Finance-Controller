'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CategoryList } from './category-list'
import { CategoryForm } from './category-form'
import { Plus, MoreVertical, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Category = {
  id: string
  name: string
  type: string
  icon: string | null
  color: string | null
  parentId: string | null
  _count: { children: number; transactions: number }
}

type Props = {
  categories: Category[]
  allCategories: Category[]
  previewLimit?: number
  dialogTitle: string
  sectionType: 'INCOME' | 'EXPENSE'
}

const sectionConfig = {
  INCOME: {
    icon: TrendingUp,
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
    addButtonClass: 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400',
    footerLinkClass: 'text-emerald-600 hover:text-emerald-500 dark:text-emerald-400',
    addLabel: 'Adicionar categoria de receita',
  },
  EXPENSE: {
    icon: TrendingDown,
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
    addButtonClass: 'border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400',
    footerLinkClass: 'text-amber-600 hover:text-amber-500 dark:text-amber-400',
    addLabel: 'Adicionar categoria de despesa',
  },
}

export function CategoryListCard({
  categories,
  allCategories,
  previewLimit = 5,
  dialogTitle,
  sectionType,
}: Props) {
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const config = sectionConfig[sectionType]
  const SectionIcon = config.icon

  const parents = categories.filter((c) => !c.parentId)
  const orphans = categories.filter(
    (c) => c.parentId && !categories.find((p) => p.id === c.parentId),
  )
  const previewParents = parents.slice(0, previewLimit)
  const previewIds = new Set(previewParents.map((p) => p.id))
  const previewCategories = categories.filter(
    (c) => previewIds.has(c.id) || (c.parentId && previewIds.has(c.parentId)),
  )

  const hiddenCount = parents.length - previewParents.length + orphans.length
  const showMore = hiddenCount > 0
  const title = sectionType === 'INCOME' ? 'Receitas' : 'Despesas'

  return (
    <div className="bg-card border-border/50 flex flex-col rounded-2xl border shadow-sm">
      {/* Card header */}
      <div className="border-border/40 flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={cn('flex size-10 items-center justify-center rounded-xl', config.iconBg)}>
            <SectionIcon className={cn('size-5', config.iconColor)} />
          </div>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-muted-foreground text-xs">
              {parents.length}{' '}
              {parents.length === 1 ? 'categoria principal' : 'categorias principais'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn('gap-1.5', config.addButtonClass)}
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" />
            Adicionar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" className="rounded-full" />}
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end"></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 px-3 py-3">
        {categories.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-sm">
            Nenhuma categoria de {sectionType === 'INCOME' ? 'receita' : 'despesa'}
          </p>
        ) : (
          <CategoryList categories={previewCategories} allCategories={allCategories} />
        )}
      </div>

      {/* Footer */}
      <div className="border-border/40 flex items-center justify-between border-t px-5 py-3">
        <button
          onClick={() => setAddOpen(true)}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium transition-colors',
            config.footerLinkClass,
          )}
        >
          <Plus className="size-3.5" />
          {config.addLabel}
        </button>

        {showMore && (
          <button
            onClick={() => setOpen(true)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
          >
            Ver todas ({categories.length} categorias)
            <ArrowRight className="size-3.5" />
          </button>
        )}
      </div>

      <CategoryForm
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={allCategories}
        defaultType={sectionType}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <CategoryList categories={categories} allCategories={allCategories} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
