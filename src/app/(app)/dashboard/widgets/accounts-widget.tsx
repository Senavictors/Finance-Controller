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
      <div className="flex-1 rounded-[2rem] border border-white/50 bg-[#F2F2F2] p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-gray-500">Contas</h3>
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
                  <span className="text-xs font-medium text-gray-700">{acc.name}</span>
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    acc.balance >= 0 ? 'text-gray-900' : 'text-red-600',
                  )}
                >
                  {formatCurrency(acc.balance)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Nenhuma conta</p>
        )}
      </div>

      <div className="relative overflow-hidden rounded-[2rem] bg-gray-900 p-5 text-white shadow-xl">
        <div className="absolute top-1/2 right-[20%] size-24 -translate-y-1/2 rounded-full border border-white/10" />
        <div className="relative">
          <p className="text-xs font-medium text-gray-400">Patrimonio</p>
          <p className="mt-2 text-xl font-medium tracking-tight text-white">
            {formatCurrency(totalBalance)}
          </p>
        </div>
      </div>
    </div>
  )
}
