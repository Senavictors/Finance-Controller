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
        isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
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
    <div className="relative h-full rounded-[2rem] border border-white/50 bg-[#EAEAEA] p-6 shadow-sm">
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-gray-500">Receitas</h3>
          <p className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
            {formatCurrency(data.totalIncome)}
          </p>
          <VariationBadge value={data.incomeVariation} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500">Despesas</h3>
          <p className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
            {formatCurrency(data.totalExpenses)}
          </p>
          <VariationBadge value={data.expenseVariation} />
        </div>
      </div>

      <div className="my-4 h-px w-full bg-gray-300" />

      {barData.some((d) => d.value > 0) ? (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={barData} layout="vertical" barCategoryGap="35%">
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={75}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Math.round(Number(value) * 100))}
              contentStyle={{
                borderRadius: '16px',
                border: 'none',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
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
        <div className="flex h-[120px] items-center justify-center text-sm text-gray-400">
          Sem dados neste periodo
        </div>
      )}
    </div>
  )
}
