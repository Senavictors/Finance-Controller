'use client'

import { formatCurrency } from '@/lib/format'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { BrandDot } from '@/lib/brands'
import type { DashboardData } from './types'

export function CategoryDonutWidget({ data }: { data: DashboardData }) {
  const { expensesByCategory } = data

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border border-white/50 bg-gradient-to-br from-white to-gray-50 p-6 shadow-sm">
      <h3 className="mb-4 shrink-0 text-sm font-medium text-gray-500">Gastos por Categoria</h3>

      {expensesByCategory.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-6 sm:flex-row">
          <div className="shrink-0">
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={68}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={2}
                >
                  {expensesByCategory.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {expensesByCategory.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <BrandDot
                    brandKey={cat.icon}
                    fallbackText={cat.name}
                    fallbackColor={cat.color}
                    fallbackLabel={cat.name}
                    size={12}
                  />
                  <span className="truncate text-xs text-gray-600">{cat.name}</span>
                </div>
                <span className="shrink-0 text-xs font-semibold whitespace-nowrap text-gray-900">
                  {formatCurrency(cat.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-[150px] items-center justify-center text-sm text-gray-400">
          Sem despesas neste periodo
        </div>
      )}
    </div>
  )
}
