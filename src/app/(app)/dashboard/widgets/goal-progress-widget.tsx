'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './types'

const statusLabels: Record<string, string> = {
  ON_TRACK: 'No ritmo',
  WARNING: 'Atencao',
  AT_RISK: 'Em risco',
  ACHIEVED: 'Atingida',
  EXCEEDED: 'Ultrapassada',
}

function barColor(status: string) {
  if (status === 'ACHIEVED') return 'bg-emerald-500'
  if (status === 'ON_TRACK') return 'bg-teal-500'
  if (status === 'WARNING') return 'bg-amber-400'
  return 'bg-red-500'
}

export function GoalProgressWidget({ data }: { data: DashboardData }) {
  const { goals } = data
  const visible = goals.slice(0, 4)

  return (
    <div className="flex h-full flex-col rounded-[2rem] border border-white/50 bg-[#F2F2F2] p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">Metas</h3>
        <Link href="/goals" className="text-xs font-medium text-teal-600 hover:text-teal-700">
          Ver todas
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-xs text-gray-400">Nenhuma meta ativa</p>
            <Link
              href="/goals"
              className="mt-1 inline-block text-xs font-medium text-teal-600 hover:text-teal-700"
            >
              Criar meta
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto">
          {visible.map((goal) => (
            <div key={goal.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-gray-700">{goal.name}</span>
                <span className="shrink-0 text-[10px] text-gray-400">
                  {statusLabels[goal.status] ?? goal.status}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full transition-all ${barColor(goal.status)}`}
                  style={{ width: `${Math.min(goal.progressPercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>
                  {formatCurrency(goal.actualAmount)} / {formatCurrency(goal.targetAmount)}
                </span>
                <span className="font-medium text-gray-600">{goal.progressPercent}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
