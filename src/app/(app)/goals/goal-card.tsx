'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { GoalProgressResult } from '@/server/modules/finance/application/goals'
import { useConfirm } from '@/components/ui/confirm-dialog'

const statusLabels: Record<string, string> = {
  ON_TRACK: 'No ritmo',
  WARNING: 'Atencao',
  AT_RISK: 'Em risco',
  ACHIEVED: 'Atingida',
  EXCEEDED: 'Ultrapassada',
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ON_TRACK: 'default',
  WARNING: 'secondary',
  AT_RISK: 'destructive',
  ACHIEVED: 'default',
  EXCEEDED: 'destructive',
}

const metricLabels: Record<string, string> = {
  SAVING: 'Economia',
  EXPENSE_LIMIT: 'Limite de gasto',
  INCOME_TARGET: 'Meta de receita',
  ACCOUNT_LIMIT: 'Limite de conta',
}

const scopeLabels: Record<string, string> = {
  GLOBAL: 'Global',
  CATEGORY: 'Por categoria',
  ACCOUNT: 'Por conta',
}

type GoalCardProps = {
  goal: GoalProgressResult
}

function ProgressBar({ percent, status }: { percent: number; status: string }) {
  const colorClass =
    status === 'ACHIEVED'
      ? 'bg-emerald-500'
      : status === 'ON_TRACK'
        ? 'bg-teal-500'
        : status === 'WARNING'
          ? 'bg-amber-400'
          : 'bg-red-500'

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  )
}

export function GoalCard({ goal }: GoalCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  async function handleArchive() {
    const ok = await confirm({
      title: `Arquivar "${goal.name}"?`,
      description: 'A meta sera arquivada e deixa de aparecer na lista ativa.',
      confirmText: 'Arquivar',
    })
    if (!ok) return
    setLoading(true)
    try {
      await fetch(`/api/goals/${goal.goalId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const isLimitMetric = goal.metric === 'EXPENSE_LIMIT' || goal.metric === 'ACCOUNT_LIMIT'
  const remaining = goal.targetAmount - goal.actualAmount

  return (
    <Card className="rounded-[1.5rem] border-white/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{goal.name}</CardTitle>
            {goal.description && (
              <p className="mt-0.5 truncate text-xs text-gray-500">{goal.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-gray-400 hover:text-red-600"
            onClick={handleArchive}
            disabled={loading}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Badge variant={statusVariants[goal.status] ?? 'secondary'}>
            {statusLabels[goal.status] ?? goal.status}
          </Badge>
          <span className="text-xs text-gray-400">{metricLabels[goal.metric]}</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{scopeLabels[goal.scopeType]}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-end justify-between">
            <span className="text-2xl font-semibold tracking-tight">
              {formatCurrency(goal.actualAmount)}
            </span>
            <span className="text-sm text-gray-500">de {formatCurrency(goal.targetAmount)}</span>
          </div>
          <ProgressBar percent={goal.progressPercent} status={goal.status} />
          <p className="mt-1 text-right text-xs text-gray-400">{goal.progressPercent}%</p>
        </div>

        {goal.alerts.length > 0 && (
          <div className="space-y-0.5">
            {goal.alerts.map((alert, i) => (
              <p key={i} className="text-xs text-amber-700">
                {alert}
              </p>
            ))}
          </div>
        )}

        {isLimitMetric && remaining > 0 && goal.status !== 'EXCEEDED' && (
          <p className="text-xs text-gray-500">Disponivel: {formatCurrency(remaining)}</p>
        )}
      </CardContent>
      {ConfirmDialog}
    </Card>
  )
}
