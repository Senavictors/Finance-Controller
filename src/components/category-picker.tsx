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

  // Subcategory is optional: if parent has children but none selected, submit parent id
  const finalValue =
    parentId === 'none' ? '' : hasChildren ? (childId === 'none' ? parentId : childId) : parentId

  const parentItems: Record<string, string> = {
    none: 'Nenhuma',
    ...Object.fromEntries(parents.map((p) => [p.id, p.name])),
  }

  const childItems: Record<string, string> = {
    none: 'Nenhuma subcategoria',
    ...Object.fromEntries(children.map((c) => [c.id, c.name])),
  }

  function handleParentChange(value: string | null) {
    setParentId(value ?? 'none')
    setChildId('none')
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={finalValue} />

      <Select value={parentId} items={parentItems} onValueChange={handleParentChange}>
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

      <Select
        value={childId}
        items={childItems}
        disabled={parentId === 'none' || !hasChildren}
        onValueChange={(v: string | null) => setChildId(v ?? 'none')}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              parentId === 'none'
                ? 'Selecione uma categoria primeiro'
                : !hasChildren
                  ? 'Sem subcategorias'
                  : 'Nenhuma subcategoria'
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhuma subcategoria</SelectItem>
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
    </div>
  )
}
