'use client'

import { useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BrandDot } from '@/lib/brands'

type Category = {
  id: string
  name: string
  type: string
  color?: string | null
  icon?: string | null
  parentId?: string | null
}

type Props = {
  categories: Category[]
  type: string
  name?: string
  defaultValue?: string | null
}

export function CategoryPicker({ categories, type, name = 'categoryId', defaultValue }: Props) {
  const defaultCat = defaultValue ? categories.find((c) => c.id === defaultValue) : null

  // If defaultCat has a parentId it's a child; initialise parent + child selects accordingly
  const initialParentId = defaultCat
    ? (defaultCat.parentId ?? defaultCat.id)
    : 'none'
  const initialChildId = defaultCat?.parentId ? defaultCat.id : 'none'

  const [parentId, setParentId] = useState(initialParentId)
  const [childId, setChildId] = useState(initialChildId)

  const parents = useMemo(
    () => categories.filter((c) => !c.parentId && c.type === type),
    [categories, type],
  )

  const children = useMemo(
    () => (parentId !== 'none' ? categories.filter((c) => c.parentId === parentId) : []),
    [categories, parentId],
  )

  const hasChildren = children.length > 0

  // Final value submitted: child id when subcategory chosen, parent id when parent has no children
  const finalValue =
    parentId === 'none' ? '' : hasChildren ? (childId === 'none' ? '' : childId) : parentId

  function handleParentChange(value: string | null) {
    setParentId(value ?? 'none')
    setChildId('none')
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={finalValue} />

      <Select value={parentId} onValueChange={handleParentChange}>
        <SelectTrigger>
          <SelectValue placeholder="Nenhuma" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhuma</SelectItem>
          {parents.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <BrandDot
                  brandKey={p.icon}
                  fallbackText={p.name}
                  fallbackColor={p.color}
                  fallbackLabel={p.name}
                  size={14}
                />
                {p.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasChildren && (
        <Select value={childId} onValueChange={(v: string | null) => setChildId(v ?? 'none')}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a subcategoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecione a subcategoria…</SelectItem>
            {children.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <BrandDot
                    brandKey={c.icon}
                    fallbackText={c.name}
                    fallbackColor={c.color}
                    fallbackLabel={c.name}
                    size={14}
                  />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
