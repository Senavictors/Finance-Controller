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
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CategoryForm } from './category-form'

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

  return (
    <div className="space-y-1">
      {parents.map((parent) => (
        <div key={parent.id}>
          <CategoryRow category={parent} allCategories={allCategories} />
          {getChildren(parent.id).map((child) => (
            <CategoryRow key={child.id} category={child} allCategories={allCategories} indent />
          ))}
        </div>
      ))}
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
  indent,
}: {
  category: Category
  allCategories: Category[]
  indent?: boolean
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  async function handleDelete() {
    if (category._count.transactions > 0) {
      alert('Categoria possui transacoes vinculadas. Remova ou reatribua primeiro.')
      return
    }
    if (!confirm(`Excluir "${category.name}"?`)) return
    await fetch(`/api/categories/${category.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <>
      <div
        className={`hover:bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 ${indent ? 'ml-6' : ''}`}
      >
        <div className="flex items-center gap-2">
          {category.color && (
            <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} />
          )}
          <span className="text-sm font-medium">{category.name}</span>
          {category._count.transactions > 0 && (
            <Badge variant="secondary" className="text-xs">
              {category._count.transactions}
            </Badge>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
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
      <CategoryForm
        open={editOpen}
        onOpenChange={setEditOpen}
        category={category}
        categories={allCategories}
      />
    </>
  )
}
