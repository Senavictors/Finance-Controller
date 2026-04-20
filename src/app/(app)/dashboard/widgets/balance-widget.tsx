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
        isPositive
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
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
    <div className="border-border/60 from-card via-card to-muted/45 relative h-full overflow-hidden rounded-[2rem] border bg-gradient-to-b p-6 shadow-sm">
      <div className="bg-primary/10 absolute -top-10 -right-10 size-48 rounded-full blur-3xl" />
      <div className="bg-accent/20 absolute -bottom-10 -left-10 size-48 rounded-full blur-3xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div>
          <h1 className="text-foreground text-2xl leading-[1.1] font-medium tracking-tight lg:text-3xl">
            Ola, {data.userName}.
            <br />
            <span className="text-muted-foreground">Seu resumo financeiro.</span>
          </h1>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 text-sm">Saldo do mes</p>
          <div className="flex items-baseline gap-3">
            <span className="text-foreground text-2xl font-semibold tracking-tight">
              {formatCurrency(balance)}
            </span>
            <VariationBadge
              value={Math.round((data.incomeVariation - data.expenseVariation) * 10) / 10}
            />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">vs. mes anterior</p>
        </div>
      </div>
    </div>
  )
}
