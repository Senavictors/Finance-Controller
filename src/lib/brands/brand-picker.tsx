'use client'

import { useMemo, useState } from 'react'
import { BrandIcon } from './brand-icon'
import { BRANDS, listBrands, type BrandCategory } from './registry'
import { cn } from '@/lib/utils'

type BrandPickerProps = {
  value: string | null
  onChange: (key: string | null) => void
  fallbackLabel: string
  fallbackColor?: string | null
  categories?: BrandCategory[]
  className?: string
}

const CATEGORY_LABELS: Record<BrandCategory, string> = {
  bank: 'Bancos',
  network: 'Bandeiras',
  payment: 'Pagamentos',
  subscription: 'Assinaturas',
}

const DEFAULT_CATEGORIES: BrandCategory[] = ['bank', 'network', 'payment', 'subscription']

export function BrandPicker({
  value,
  onChange,
  fallbackLabel,
  fallbackColor,
  categories = DEFAULT_CATEGORIES,
  className,
}: BrandPickerProps) {
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return categories.map((category) => ({
      category,
      items: listBrands(category).filter((brand) =>
        normalized ? brand.name.toLowerCase().includes(normalized) : true,
      ),
    }))
  }, [categories, query])

  const selected = value ? BRANDS[value] : null

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="border-border/60 bg-muted/50 flex items-center gap-3 rounded-xl border p-3">
        <BrandIcon
          brandKey={value}
          fallbackLabel={fallbackLabel}
          fallbackColor={fallbackColor}
          size={40}
          radius="md"
        />
        <div className="flex-1">
          <p className="text-foreground text-sm font-semibold">{selected?.name ?? fallbackLabel}</p>
          <p className="text-muted-foreground text-xs">
            {selected
              ? `Marca: ${selected.name}`
              : 'Nenhuma marca selecionada — usando fallback por cor'}
          </p>
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            Limpar
          </button>
        )}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar marca..."
        className="border-border bg-background focus-visible:ring-primary/20 h-9 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
      />

      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {grouped.map(({ category, items }) =>
          items.length === 0 ? null : (
            <div key={category}>
              <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wider uppercase">
                {CATEGORY_LABELS[category]}
              </p>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {items.map((brand) => (
                  <button
                    key={brand.key}
                    type="button"
                    onClick={() => onChange(brand.key)}
                    title={brand.name}
                    className={cn(
                      'group flex items-center justify-center rounded-xl p-1 transition-colors',
                      value === brand.key
                        ? 'ring-primary bg-muted/60 ring-offset-background ring-2 ring-offset-1'
                        : 'hover:bg-muted/70',
                    )}
                  >
                    <BrandIcon
                      brandKey={brand.key}
                      fallbackLabel={brand.name}
                      size={36}
                      radius="md"
                    />
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
