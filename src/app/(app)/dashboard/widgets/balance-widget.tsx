'use client'

import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DashboardData } from './types'

function VariationBadge({ value }: { value: number }) {
  if (value === 0) return null
  const isPositive = value > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
      )}
    >
      {isPositive ? '+' : ''}
      {value}%
    </span>
  )
}

export function BalanceWidget({ data }: { data: DashboardData }) {
  const balance = data.totalIncome - data.totalExpenses

  return (
    <div className="relative h-full overflow-hidden rounded-[2rem] border border-white/50 bg-gradient-to-b from-white to-gray-100 p-6 shadow-sm">
      <div className="bg-primary/10 absolute -top-10 -right-10 size-48 rounded-full blur-3xl" />
      <div className="bg-accent/20 absolute -bottom-10 -left-10 size-48 rounded-full blur-3xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div>
          <h1 className="text-2xl leading-[1.1] font-medium tracking-tight text-gray-900 lg:text-3xl">
            Ola, {data.userName}.
            <br />
            <span className="text-gray-400">Seu resumo financeiro.</span>
          </h1>
        </div>
        <div>
          <p className="mb-1 text-sm text-gray-500">Saldo do mes</p>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold tracking-tight text-gray-900">
              {formatCurrency(balance)}
            </span>
            <VariationBadge
              value={Math.round((data.incomeVariation - data.expenseVariation) * 10) / 10}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">vs. mes anterior</p>
        </div>
      </div>
    </div>
  )
}
