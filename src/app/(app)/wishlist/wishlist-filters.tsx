'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type WishlistCategoryOption = {
  id: string
  name: string
}

type Props = {
  categories: WishlistCategoryOption[]
}

const statusOptions = {
  all: 'Todos os status',
  READY_TO_BUY: 'Pronto para comprar',
  MONITORING: 'Monitorando',
  DESIRED: 'Desejado',
  PURCHASED: 'Comprado',
  CANCELED: 'Cancelado',
}

const priorityOptions = {
  all: 'Todas as prioridades',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baixa',
}

export function WishlistFilters({ categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentStatus = searchParams.get('status') ?? 'all'
  const currentPriority = searchParams.get('priority') ?? 'all'
  const currentCategoryId = searchParams.get('categoryId') ?? 'all'
  const currentQuery = searchParams.get('q') ?? ''

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())

      if (value && value !== 'all') {
        params.set(key, value)
      } else {
        params.delete(key)
      }

      router.replace(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  const categoryItems: Record<string, string> = {
    all: 'Todas as categorias',
    ...Object.fromEntries(categories.map((category) => [category.id, category.name])),
  }

  return (
    <div className="bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-3 shadow-sm">
      <Select
        key={`status:${currentStatus}`}
        items={statusOptions}
        defaultValue={currentStatus}
        onValueChange={(value) => updateParam('status', value)}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Todos os status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="READY_TO_BUY">Pronto para comprar</SelectItem>
          <SelectItem value="MONITORING">Monitorando</SelectItem>
          <SelectItem value="DESIRED">Desejado</SelectItem>
          <SelectItem value="PURCHASED">Comprado</SelectItem>
          <SelectItem value="CANCELED">Cancelado</SelectItem>
        </SelectContent>
      </Select>

      <Select
        key={`priority:${currentPriority}`}
        items={priorityOptions}
        defaultValue={currentPriority}
        onValueChange={(value) => updateParam('priority', value)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Todas as prioridades" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as prioridades</SelectItem>
          <SelectItem value="HIGH">Alta</SelectItem>
          <SelectItem value="MEDIUM">Media</SelectItem>
          <SelectItem value="LOW">Baixa</SelectItem>
        </SelectContent>
      </Select>

      <Select
        key={`category:${currentCategoryId}`}
        items={categoryItems}
        defaultValue={currentCategoryId}
        onValueChange={(value) => updateParam('categoryId', value)}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Todas as categorias" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        key={`query:${currentQuery}`}
        placeholder="Buscar produto..."
        defaultValue={currentQuery}
        className="w-[220px]"
        onChange={(e) => {
          const value = e.target.value
          if (value.length === 0 || value.length >= 2) {
            updateParam('q', value || null)
          }
        }}
      />
    </div>
  )
}
