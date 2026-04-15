'use client'

import dynamic from 'next/dynamic'
import type { DashboardData } from './widgets/types'

const DashboardGrid = dynamic(() => import('./dashboard-grid').then((m) => m.DashboardGrid), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-96 items-center justify-center text-sm">
      Carregando dashboard...
    </div>
  ),
})

type Props = {
  data: DashboardData
  widgets: {
    id: string
    type: string
    x: number
    y: number
    w: number
    h: number
  }[]
}

export function DashboardClient({ data, widgets }: Props) {
  return <DashboardGrid data={data} widgets={widgets} />
}
