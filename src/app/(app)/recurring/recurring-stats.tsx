'use client'

import { TrendingDown, Calendar, CheckCircle2, Tag } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

type RecurringStatsProps = {
  totalMonthly: number
  nextCharge: { description: string; nextDateIso: string } | null
  activeCount: number
  categoriesCount: number
}

export function RecurringStats({
  totalMonthly,
  nextCharge,
  activeCount,
  categoriesCount,
}: RecurringStatsProps) {
  const nextDateLabel = nextCharge
    ? new Date(nextCharge.nextDateIso).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'short',
      })
    : '—'

  const stats = [
    {
      label: 'Total mensal recorrente',
      value: formatCurrency(totalMonthly),
      sublabel: 'Valor total por mês',
      icon: TrendingDown,
      iconClass: 'bg-rose-500/10 text-rose-500',
    },
    {
      label: 'Próxima cobrança',
      value: nextDateLabel,
      sublabel: nextCharge?.description ?? '—',
      icon: Calendar,
      iconClass: 'bg-amber-500/10 text-amber-500',
    },
    {
      label: 'Regras ativas',
      value: activeCount,
      sublabel: 'Regras em execução',
      icon: CheckCircle2,
      iconClass: 'bg-emerald-500/10 text-emerald-500',
    },
    {
      label: 'Categorias recorrentes',
      value: categoriesCount,
      sublabel: 'Categorias utilizadas',
      icon: Tag,
      iconClass: 'bg-blue-500/10 text-blue-500',
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
              <p className="text-foreground text-2xl font-bold leading-tight">{stat.value}</p>
              <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{stat.sublabel}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
