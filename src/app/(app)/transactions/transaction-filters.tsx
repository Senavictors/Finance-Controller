'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCallback } from 'react'
import { BrandDot } from '@/lib/brands'

type FilterOption = {
  id: string
  name: string
  color?: string | null
  icon?: string | null
}

type Props = {
  accounts: FilterOption[]
  categories: (FilterOption & { type: string })[]
}

export function TransactionFilters({ accounts, categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== 'all') {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      router.replace(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  const accountItems: Record<string, string> = {
    all: 'Todas as contas',
    ...Object.fromEntries(accounts.map((a) => [a.id, a.name])),
  }
  const categoryItems: Record<string, string> = {
    all: 'Todas as categorias',
    ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        items={accountItems}
        defaultValue={searchParams.get('accountId') ?? 'all'}
        onValueChange={(v) => updateParam('accountId', v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Todas as contas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as contas</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <BrandDot
                  brandKey={a.icon}
                  fallbackText={a.name}
                  fallbackColor={a.color}
                  fallbackLabel={a.name}
                  size={14}
                />
                {a.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={categoryItems}
        defaultValue={searchParams.get('categoryId') ?? 'all'}
        onValueChange={(v) => updateParam('categoryId', v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Todas as categorias" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {categories.map((c) => (
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

      <Input
        placeholder="Buscar descricao..."
        defaultValue={searchParams.get('q') ?? ''}
        className="w-[200px]"
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
