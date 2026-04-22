'use client'

import { cn } from '@/lib/utils'
import type { DashboardData } from './types'

const statusLabels = {
  CRITICAL: 'Critico',
  ATTENTION: 'Em atenção',
  GOOD: 'Bom',
  EXCELLENT: 'Excelente',
} as const

const statusClasses = {
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  ATTENTION: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  GOOD: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  EXCELLENT: 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
} as const

const toneClasses = {
  positive: 'text-emerald-700',
  warning: 'text-amber-700',
  negative: 'text-red-700',
  info: 'text-muted-foreground',
} as const

const gaugeColors = {
  CRITICAL: '#dc2626',
  ATTENTION: '#f59e0b',
  GOOD: '#10b981',
  EXCELLENT: '#0d9488',
} as const

function ScoreGauge({ value, color }: { value: number; color: string }) {
  const size = 180
  const stroke = 14
  const radius = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const offset = circumference - (clamped / 100) * circumference

  const startX = cx - radius
  const startY = cy
  const endX = cx + radius
  const endY = cy
  const arcPath = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`

  return (
    <svg
      width={size}
      height={size / 2 + stroke}
      viewBox={`0 0 ${size} ${size / 2 + stroke}`}
      className="overflow-visible"
    >
      <path
        d={arcPath}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={arcPath}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 500ms ease-out' }}
      />
    </svg>
  )
}

export function ScoreWidget({ data }: { data: DashboardData }) {
  const { score } = data
  const { score: value, status, delta, factors, insights } = score

  const activeFactors = factors.filter((f) => f.weight > 0)
  const deltaText =
    delta === null ? 'Sem histórico anterior' : delta === 0 ? 'Sem variação vs mes anterior' : null

  return (
    <div className="fc-panel-subtle flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-medium">Score financeiro</h3>
        <span
          className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', statusClasses[status])}
        >
          {statusLabels[status]}
        </span>
      </div>

      <div className="relative mb-2 flex flex-col items-center">
        <ScoreGauge value={value} color={gaugeColors[status]} />
        <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center">
          <p className="text-foreground text-4xl font-semibold tracking-tight">{value}</p>
          <p className="text-muted-foreground -mt-0.5 text-[11px]">de 100</p>
        </div>
        <div className="text-muted-foreground mt-1 flex w-full items-center justify-between text-[10px]">
          <span>0</span>
          {delta !== null && delta !== 0 && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                delta > 0
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
              )}
            >
              {delta > 0 ? '+' : ''}
              {delta} vs mes anterior
            </span>
          )}
          <span>100</span>
        </div>
      </div>
      {deltaText && (
        <p className="text-muted-foreground mb-3 text-center text-[11px]">{deltaText}</p>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          Fatores
        </p>
        {activeFactors.map((factor) => {
          const pct = factor.weight > 0 ? Math.round((factor.points / factor.weight) * 100) : 0
          return (
            <div key={factor.key} className="bg-card/80 rounded-xl p-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground font-medium">{factor.label}</span>
                <span className="text-muted-foreground">
                  {factor.points}/{factor.weight}
                </span>
              </div>
              <div className="bg-border/70 mt-1.5 h-1 overflow-hidden rounded-full">
                <div
                  className={cn(
                    'h-full rounded-full',
                    pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-[11px]">{factor.reason}</p>
            </div>
          )
        })}
      </div>

      {insights.length > 0 && (
        <div className="mt-3 space-y-1">
          {insights.slice(0, 3).map((insight, i) => (
            <p key={i} className={cn('text-[11px]', toneClasses[insight.tone])}>
              - {insight.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
