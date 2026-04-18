'use client'

import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp, ArrowLeftRight } from 'lucide-react'
import { BrandDot, BrandIcon, getBrand, matchBrand } from '@/lib/brands'
import type { DashboardData } from './types'

export function RecentTransactionsWidget({ data }: { data: DashboardData }) {
  const { recentTransactions } = data

  return (
    <div className="h-full rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-[#F6F6F6] p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-gray-500">Ultimas Transacoes</h3>

      {recentTransactions.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {recentTransactions.map((tx) => {
            const inferredBrandKey =
              matchBrand(tx.description) ?? tx.category?.icon ?? tx.account.icon
            const inferredBrand = getBrand(inferredBrandKey)

            return (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
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
                        'flex size-9 items-center justify-center rounded-xl',
                        tx.type === 'INCOME' && 'bg-emerald-100',
                        tx.type === 'EXPENSE' && 'bg-red-100',
                        tx.type === 'TRANSFER' && 'bg-gray-100',
                      )}
                    >
                      {tx.type === 'INCOME' ? (
                        <TrendingUp className="size-4 text-emerald-600" />
                      ) : tx.type === 'EXPENSE' ? (
                        <TrendingDown className="size-4 text-red-600" />
                      ) : (
                        <ArrowLeftRight className="size-4 text-gray-500" />
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                    <p className="flex items-center gap-1.5 text-xs text-gray-400">
                      <BrandDot
                        brandKey={tx.account.icon}
                        fallbackText={tx.account.name}
                        fallbackColor={tx.account.color}
                        fallbackLabel={tx.account.name}
                        size={10}
                      />
                      <span>{tx.account.name}</span>
                      <span>&middot;</span>
                      <span>{formatDate(tx.date)}</span>
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-sm font-semibold',
                    tx.type === 'INCOME' && 'text-emerald-600',
                    tx.type === 'EXPENSE' && 'text-red-600',
                    tx.type === 'TRANSFER' && 'text-gray-500',
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
        <p className="py-6 text-center text-sm text-gray-400">Nenhuma transacao registrada</p>
      )}
    </div>
  )
}
