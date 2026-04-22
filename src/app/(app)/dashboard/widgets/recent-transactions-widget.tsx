'use client'

import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp, ArrowLeftRight } from 'lucide-react'
import { BrandDot, BrandIcon, getBrand, matchBrand } from '@/lib/brands'
import type { DashboardData } from './types'

export function RecentTransactionsWidget({ data }: { data: DashboardData }) {
  const { recentTransactions } = data

  return (
    <div className="fc-panel flex h-full min-h-0 flex-col p-6">
      <h3 className="text-muted-foreground mb-4 shrink-0 text-sm font-medium">
        Últimas Transações
      </h3>

      {recentTransactions.length > 0 ? (
        <div className="divide-border/60 min-h-0 flex-1 divide-y overflow-y-auto pr-1">
          {recentTransactions.map((tx) => {
            const inferredBrandKey =
              matchBrand(tx.description) ?? tx.category?.icon ?? tx.account.icon
            const inferredBrand = getBrand(inferredBrandKey)

            return (
              <div key={tx.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {inferredBrand ? (
                    <BrandIcon
                      brandKey={inferredBrand.key}
                      fallbackLabel={tx.description}
                      size={36}
                      radius="md"
                    />
                  ) : (
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl',
                        tx.type === 'INCOME' && 'bg-emerald-100',
                        tx.type === 'EXPENSE' && 'bg-red-100',
                        tx.type === 'TRANSFER' && 'bg-muted',
                      )}
                    >
                      {tx.type === 'INCOME' ? (
                        <TrendingUp className="size-4 text-emerald-600" />
                      ) : tx.type === 'EXPENSE' ? (
                        <TrendingDown className="size-4 text-red-600" />
                      ) : (
                        <ArrowLeftRight className="text-muted-foreground size-4" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-medium">{tx.description}</p>
                    <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                      <BrandDot
                        brandKey={tx.account.icon}
                        fallbackText={tx.account.name}
                        fallbackColor={tx.account.color}
                        fallbackLabel={tx.account.name}
                        size={10}
                      />
                      <span className="truncate">{tx.account.name}</span>
                      <span>&middot;</span>
                      <span className="whitespace-nowrap">{formatDate(tx.date)}</span>
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-right text-sm font-semibold whitespace-nowrap',
                    tx.type === 'INCOME' && 'text-emerald-600',
                    tx.type === 'EXPENSE' && 'text-red-600',
                    tx.type === 'TRANSFER' && 'text-muted-foreground',
                  )}
                >
                  {tx.type === 'EXPENSE' ? '- ' : tx.type === 'INCOME' ? '+ ' : ''}
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Nenhuma transação registrada
        </p>
      )}
    </div>
  )
}
