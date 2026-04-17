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
  LOW: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-red-100 text-red-700',
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
    <div className="flex h-full flex-col rounded-[2rem] border border-white/50 bg-[#F2F2F2] p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">Previsao do mes</h3>
        <span
          className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', riskClasses[riskLevel])}
        >
          Risco {riskLabels[riskLevel]}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-xs text-gray-500">Saldo previsto no fechamento</p>
        <p
          className={cn(
            'mt-1 text-3xl font-semibold tracking-tight',
            predictedBalance >= 0 ? 'text-gray-900' : 'text-red-600',
          )}
        >
          {formatCurrency(predictedBalance)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-xl bg-white/70 p-2">
          <p className="text-gray-400">Realizado</p>
          <p
            className={cn(
              'mt-0.5 font-semibold',
              realizado >= 0 ? 'text-gray-900' : 'text-red-600',
            )}
          >
            {formatCurrency(realizado)}
          </p>
        </div>
        <div className="rounded-xl bg-white/70 p-2">
          <p className="text-gray-400">Recorrente</p>
          <p
            className={cn(
              'mt-0.5 font-semibold',
              recorrenteFuturo >= 0 ? 'text-gray-900' : 'text-red-600',
            )}
          >
            {formatCurrency(recorrenteFuturo)}
          </p>
        </div>
        <div className="rounded-xl bg-white/70 p-2">
          <p className="text-gray-400">Variavel</p>
          <p className="mt-0.5 font-semibold text-red-600">
            -{formatCurrency(projectedVariableExpenses)}
          </p>
        </div>
      </div>

      {topAssumptions.length > 0 && (
        <div className="mt-4 flex-1 space-y-1 overflow-y-auto">
          <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
            Premissas principais
          </p>
          {topAssumptions.map((assumption, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] text-gray-600">
              <span className="truncate pr-2">{assumption.label}</span>
              <span className="shrink-0 font-medium text-gray-800">
                {formatCurrency(assumption.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
