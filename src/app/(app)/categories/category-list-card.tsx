'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CategoryList } from './category-list'

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
}

export function CategoryListCard({
  categories,
  allCategories,
  previewLimit = 5,
  dialogTitle,
}: Props) {
  const [open, setOpen] = useState(false)

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

  return (
    <>
      <CategoryList categories={previewCategories} allCategories={allCategories} />

      {showMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground mt-2 w-full justify-center"
          onClick={() => setOpen(true)}
        >
          Ver todas ({categories.length})
        </Button>
      )}

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
    </>
  )
}
