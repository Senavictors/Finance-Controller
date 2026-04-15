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

type FilterOption = { id: string; name: string }

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

  return (
    <div className="flex flex-wrap gap-3">
      <Select
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
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
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
              {c.name}
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
