'use client'

import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
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

export function IncomeExpensesWidget({ data }: { data: DashboardData }) {
  const barData = [
    { name: 'Receitas', value: data.totalIncome / 100, fill: '#22c55e' },
    { name: 'Despesas', value: data.totalExpenses / 100, fill: '#ef4444' },
  ]

  return (
    <div className="fc-panel-subtle relative h-full p-6">
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-muted-foreground text-sm font-medium">Receitas</h3>
          <p className="text-foreground mt-1 text-xl font-semibold tracking-tight">
            {formatCurrency(data.totalIncome)}
          </p>
          <VariationBadge value={data.incomeVariation} />
        </div>
        <div>
          <h3 className="text-muted-foreground text-sm font-medium">Despesas</h3>
          <p className="text-foreground mt-1 text-xl font-semibold tracking-tight">
            {formatCurrency(data.totalExpenses)}
          </p>
          <VariationBadge value={data.expenseVariation} />
        </div>
      </div>

      <div className="bg-border/70 my-4 h-px w-full" />

      {barData.some((d) => d.value > 0) ? (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={barData} layout="vertical" barCategoryGap="35%">
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={75}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={false}
              formatter={(value) => formatCurrency(Math.round(Number(value) * 100))}
              contentStyle={{
                backgroundColor: 'var(--card)',
                borderRadius: '16px',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.12)',
              }}
              labelStyle={{
                color: 'var(--foreground)',
                fontWeight: 600,
              }}
              itemStyle={{
                color: 'var(--foreground)',
              }}
            />
            <Bar dataKey="value" radius={[0, 12, 12, 0]}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-muted-foreground flex h-[120px] items-center justify-center text-sm">
          Sem dados neste periodo
        </div>
      )}
    </div>
  )
}
