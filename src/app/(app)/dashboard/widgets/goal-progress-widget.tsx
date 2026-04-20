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
    <div className="fc-panel-subtle flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-medium">Metas</h3>
        <Link href="/goals" className="text-xs font-medium text-teal-600 hover:text-teal-500">
          Ver todas
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Nenhuma meta ativa</p>
            <Link
              href="/goals"
              className="mt-1 inline-block text-xs font-medium text-teal-600 hover:text-teal-500"
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
                <span className="text-foreground/85 truncate text-xs font-medium">{goal.name}</span>
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {statusLabels[goal.status] ?? goal.status}
                </span>
              </div>
              <div className="bg-border/70 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full transition-all ${barColor(goal.status)}`}
                  style={{ width: `${Math.min(goal.progressPercent, 100)}%` }}
                />
              </div>
              <div className="text-muted-foreground flex items-center justify-between text-[10px]">
                <span>
                  {formatCurrency(goal.actualAmount)} / {formatCurrency(goal.targetAmount)}
                </span>
                <span className="text-foreground/85 font-medium">{goal.progressPercent}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
