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
import { useCallback, useState } from 'react'
import { BrandDot } from '@/lib/brands'
import { Search } from 'lucide-react'

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

  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '')

  const accountItems: Record<string, string> = {
    all: 'Todas as contas',
    ...Object.fromEntries(accounts.map((a) => [a.id, a.name])),
  }
  const categoryItems: Record<string, string> = {
    all: 'Todas as categorias',
    ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
  }

  return (
    <div className="bg-card border-border/50 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 shadow-sm">
      <Select
        items={accountItems}
        defaultValue={searchParams.get('accountId') ?? 'all'}
        onValueChange={(v) => updateParam('accountId', v)}
      >
        <SelectTrigger className="h-8 w-[160px] rounded-full text-sm">
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
        <SelectTrigger className="h-8 w-[170px] rounded-full text-sm">
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

      <div className="relative flex-1 min-w-[180px]">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
        <Input
          placeholder="Buscar descrição, categoria ou conta..."
          value={searchValue}
          className="h-8 rounded-full pl-8 text-sm"
          onChange={(e) => {
            const value = e.target.value
            setSearchValue(value)
            if (value.length === 0 || value.length >= 2) {
              updateParam('q', value || null)
            }
          }}
        />
      </div>
    </div>
  )
}
