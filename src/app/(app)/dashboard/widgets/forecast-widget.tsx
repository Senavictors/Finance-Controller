'use client'

import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DashboardData } from './types'

const riskLabels = {
  LOW: 'Baixo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
} as const

const riskClasses = {
  LOW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
} as const

export function ForecastWidget({ data }: { data: DashboardData }) {
  const { forecast } = data
  const {
    predictedBalance,
    riskLevel,
    actualIncome,
    actualExpenses,
    projectedRecurringIncome,
    projectedRecurringExpenses,
    projectedVariableExpenses,
    assumptions,
  } = forecast

  const realizado = actualIncome - actualExpenses
  const recorrenteFuturo = projectedRecurringIncome - projectedRecurringExpenses
  const topAssumptions = assumptions.slice(0, 3)

  return (
    <div className="fc-panel-subtle flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-medium">Previsao do mes</h3>
        <span
          className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', riskClasses[riskLevel])}
        >
          Risco {riskLabels[riskLevel]}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-muted-foreground text-xs">Saldo previsto no fechamento</p>
        <p
          className={cn(
            'mt-1 text-3xl font-semibold tracking-tight',
            predictedBalance >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400',
          )}
        >
          {formatCurrency(predictedBalance)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="bg-card/80 rounded-xl p-2">
          <p className="text-muted-foreground">Realizado</p>
          <p
            className={cn(
              'mt-0.5 font-semibold',
              realizado >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatCurrency(realizado)}
          </p>
        </div>
        <div className="bg-card/80 rounded-xl p-2">
          <p className="text-muted-foreground">Recorrente</p>
          <p
            className={cn(
              'mt-0.5 font-semibold',
              recorrenteFuturo >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400',
            )}
          >
            {formatCurrency(recorrenteFuturo)}
          </p>
        </div>
        <div className="bg-card/80 rounded-xl p-2">
          <p className="text-muted-foreground">Variavel</p>
          <p className="mt-0.5 font-semibold text-red-600 dark:text-red-400">
            -{formatCurrency(projectedVariableExpenses)}
          </p>
        </div>
      </div>

      {topAssumptions.length > 0 && (
        <div className="mt-4 flex-1 space-y-1 overflow-y-auto">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Premissas principais
          </p>
          {topAssumptions.map((assumption, i) => (
            <div
              key={i}
              className="text-muted-foreground flex items-center justify-between text-[11px]"
            >
              <span className="truncate pr-2">{assumption.label}</span>
              <span className="text-foreground shrink-0 font-medium">
                {formatCurrency(assumption.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
