'use client'

import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  totalIncome: number
  totalExpense: number
  balance: number
  totalCount: number
  incomeCount: number
  expenseCount: number
}

export function TransactionStats({
  totalIncome,
  totalExpense,
  balance,
  totalCount,
  incomeCount,
  expenseCount,
}: Props) {
  const isNegativeBalance = balance < 0

  const stats = [
    {
      label: 'Receitas',
      value: formatCurrency(totalIncome),
      sublabel: `${incomeCount} lançamento${incomeCount !== 1 ? 's' : ''}`,
      icon: TrendingUp,
      iconClass: 'bg-emerald-500/10 text-emerald-500',
      valueClass: undefined as string | undefined,
    },
    {
      label: 'Despesas',
      value: formatCurrency(totalExpense),
      sublabel: `${expenseCount} lançamento${expenseCount !== 1 ? 's' : ''}`,
      icon: TrendingDown,
      iconClass: 'bg-rose-500/10 text-rose-500',
      valueClass: undefined as string | undefined,
    },
    {
      label: 'Saldo do período',
      value: `${isNegativeBalance ? '- ' : ''}${formatCurrency(Math.abs(balance))}`,
      sublabel: 'Receitas – Despesas',
      icon: Wallet,
      iconClass: isNegativeBalance ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500',
      valueClass: isNegativeBalance ? 'text-rose-600 dark:text-rose-400' : undefined,
    },
    {
      label: 'Total de transações',
      value: String(totalCount),
      sublabel: 'Neste período',
      icon: ArrowLeftRight,
      iconClass: 'bg-blue-500/10 text-blue-500',
      valueClass: undefined as string | undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-card border-border/50 rounded-2xl border p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div
              className={`flex size-10 flex-shrink-0 items-center justify-center rounded-xl ${stat.iconClass}`}
            >
              <stat.icon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground truncate text-xs font-medium">{stat.label}</p>
              <p className={cn('text-foreground text-2xl font-bold leading-tight', stat.valueClass)}>
                {stat.value}
              </p>
              <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{stat.sublabel}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
