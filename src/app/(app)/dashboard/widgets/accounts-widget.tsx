'use client'

import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BrandDot } from '@/lib/brands'
import type { DashboardData } from './types'

export function AccountsWidget({ data }: { data: DashboardData }) {
  const { balanceByAccount } = data
  const totalBalance = balanceByAccount.reduce((sum, a) => sum + a.balance, 0)

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="fc-panel-subtle flex-1 p-5">
        <h3 className="text-muted-foreground mb-3 text-sm font-medium">Contas</h3>
        {balanceByAccount.length > 0 ? (
          <div className="space-y-2.5">
            {balanceByAccount.map((acc) => (
              <div key={acc.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrandDot
                    brandKey={acc.icon}
                    fallbackText={acc.name}
                    fallbackColor={acc.color}
                    fallbackLabel={acc.name}
                    size={12}
                  />
                  <span className="text-foreground/85 text-xs font-medium">{acc.name}</span>
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    acc.balance >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {formatCurrency(acc.balance)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Nenhuma conta</p>
        )}
      </div>

      <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl dark:bg-slate-900">
        <div className="absolute top-1/2 right-[20%] size-24 -translate-y-1/2 rounded-full border border-white/10" />
        <div className="relative">
          <p className="text-xs font-medium text-white/60">Patrimonio</p>
          <p className="mt-2 text-xl font-medium tracking-tight text-white">
            {formatCurrency(totalBalance)}
          </p>
        </div>
      </div>
    </div>
  )
}
