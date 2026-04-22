'use client'

import { formatCurrency } from '@/lib/format'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { BrandDot } from '@/lib/brands'
import type { DashboardData } from './types'

export function CategoryDonutWidget({ data }: { data: DashboardData }) {
  const { expensesByCategory } = data

  return (
    <div className="fc-panel relative flex h-full min-h-0 flex-col overflow-hidden p-6">
      <h3 className="text-muted-foreground mb-4 shrink-0 text-sm font-medium">
        Gastos por Categoria
      </h3>

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
                  <span className="text-muted-foreground truncate text-xs">{cat.name}</span>
                </div>
                <span className="text-foreground shrink-0 text-xs font-semibold whitespace-nowrap">
                  {formatCurrency(cat.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex h-[150px] items-center justify-center text-sm">
          Sem despesas neste período
        </div>
      )}
    </div>
  )
}
