'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CategoryForm } from './category-form'
import { BrandDot } from '@/lib/brands'
import { useConfirm } from '@/components/ui/confirm-dialog'
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

export function CategoryList({
  categories,
  allCategories,
}: {
  categories: Category[]
  allCategories: Category[]
}) {
  const parents = categories.filter((c) => !c.parentId)
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-1">
      {parents.map((parent) => {
        const children = getChildren(parent.id)
        const isExpanded = !!expanded[parent.id]

        return (
          <div key={parent.id}>
            <CategoryRow
              category={parent}
              allCategories={allCategories}
              hasChildren={children.length > 0}
              isExpanded={isExpanded}
              onToggle={() => toggle(parent.id)}
            />
            {isExpanded && children.length > 0 && (
              <div className="relative ml-4 mt-0.5 space-y-0.5 pl-4">
                <div className="border-border/40 absolute top-0 left-0 h-full border-l" />
                {children.map((child) => (
                  <CategoryRow key={child.id} category={child} allCategories={allCategories} isChild />
                ))}
              </div>
            )}
          </div>
        )
      })}
      {categories
        .filter((c) => c.parentId && !categories.find((p) => p.id === c.parentId))
        .map((orphan) => (
          <CategoryRow key={orphan.id} category={orphan} allCategories={allCategories} />
        ))}
    </div>
  )
}

function CategoryRow({
  category,
  allCategories,
  hasChildren,
  isExpanded,
  onToggle,
  isChild,
}: {
  category: Category
  allCategories: Category[]
  hasChildren?: boolean
  isExpanded?: boolean
  onToggle?: () => void
  isChild?: boolean
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  async function handleDelete() {
    if (category._count.transactions > 0) {
      await confirm({
        title: 'Nao e possivel excluir',
        description: 'Categoria possui transacoes vinculadas. Remova ou reatribua primeiro.',
        confirmText: 'Entendi',
        cancelText: 'Fechar',
      })
      return
    }
    const ok = await confirm({
      title: `Excluir "${category.name}"?`,
      description: 'A categoria sera removida permanentemente.',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/categories/${category.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      <div className="hover:bg-muted/50 flex items-center justify-between rounded-xl px-3 py-2 transition-colors">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandDot
            brandKey={category.icon}
            fallbackText={category.name}
            fallbackColor={category.color}
            fallbackLabel={category.name}
            size={isChild ? 20 : 32}
          />
          <span className="truncate text-sm font-medium">{category.name}</span>
          {category._count.transactions > 0 && (
            <Badge variant="secondary" className="text-xs tabular-nums">
              {category._count.transactions}
            </Badge>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {hasChildren && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggle}
              className="rounded-full"
              title={isExpanded ? 'Recolher' : 'Expandir'}
            >
              <ChevronDown
                className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-180')}
              />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="rounded-full" />}>
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 size-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 size-3.5" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <CategoryForm
        open={editOpen}
        onOpenChange={setEditOpen}
        category={category}
        categories={allCategories}
      />
      {ConfirmDialog}
    </>
  )
}
