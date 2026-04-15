'use client'

import type { DashboardData } from './types'

export function TransactionCountWidget({ data }: { data: DashboardData }) {
  return (
    <div className="bg-accent relative h-full overflow-hidden rounded-[2rem] p-6 shadow-sm">
      <div className="border-foreground/5 absolute -top-6 -right-6 size-28 rounded-full border" />
      <div className="border-foreground/5 absolute -top-2 -right-2 size-28 rounded-full border" />
      <div className="relative">
        <p className="text-accent-foreground/70 text-sm font-medium">Transacoes</p>
        <p className="text-accent-foreground mt-2 text-3xl font-medium tracking-tight">
          {data.transactionCount}
        </p>
        <p className="text-accent-foreground/50 mt-1 text-sm">registradas neste mes</p>
      </div>
    </div>
  )
}
