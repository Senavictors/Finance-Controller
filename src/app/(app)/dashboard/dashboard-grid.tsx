'use client'

import { useState, useCallback } from 'react'
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout'
import { Button } from '@/components/ui/button'
import { GripVertical, X, Pencil, Check } from 'lucide-react'
import { widgetRegistry } from './widgets/registry'
import { BalanceWidget } from './widgets/balance-widget'
import { IncomeExpensesWidget } from './widgets/income-expenses-widget'
import { CategoryDonutWidget } from './widgets/category-donut-widget'
import { AccountsWidget } from './widgets/accounts-widget'
import { RecentTransactionsWidget } from './widgets/recent-transactions-widget'
import { TransactionCountWidget } from './widgets/transaction-count-widget'
import { GoalProgressWidget } from './widgets/goal-progress-widget'
import { ForecastWidget } from './widgets/forecast-widget'
import { ScoreWidget } from './widgets/score-widget'
import { InsightsWidget } from './widgets/insights-widget'
import { AddWidgetDialog } from './add-widget-dialog'
import { findPlacement } from './lib/auto-placement'
import type { DashboardData } from './widgets/types'

const GRID_COLS = 12
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

type WidgetItem = {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
}

type Props = {
  data: DashboardData
  widgets: WidgetItem[]
}

const widgetComponents: Record<string, React.ComponentType<{ data: DashboardData }>> = {
  balance: BalanceWidget,
  'income-expenses': IncomeExpensesWidget,
  'expenses-by-category': CategoryDonutWidget,
  accounts: AccountsWidget,
  'recent-transactions': RecentTransactionsWidget,
  'transactions-count': TransactionCountWidget,
  'goal-progress': GoalProgressWidget,
  forecast: ForecastWidget,
  score: ScoreWidget,
  insights: InsightsWidget,
}

export function DashboardGrid({ data, widgets: initialWidgets }: Props) {
  const { width: containerWidth, containerRef } = useContainerWidth()
  const [widgets, setWidgets] = useState(initialWidgets)
  const [editing, setEditing] = useState(false)

  const layouts = {
    lg: widgets.map((w) => ({
      i: w.id,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      minW: widgetRegistry.find((r) => r.type === w.type)?.minW ?? 3,
      minH: widgetRegistry.find((r) => r.type === w.type)?.minH ?? 2,
    })),
  }

  const handleLayoutChange = useCallback(
    (layout: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
      if (!editing) return
      setWidgets((prev) =>
        prev.map((widget) => {
          const item = layout.find((l) => l.i === widget.id)
          if (!item) return widget
          return { ...widget, x: item.x, y: item.y, w: item.w, h: item.h }
        }),
      )
    },
    [editing],
  )

  async function saveLayout() {
    await fetch('/api/dashboards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgets: widgets.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h })),
      }),
    })
    setEditing(false)
  }

  async function addWidget(type: string) {
    const def = widgetRegistry.find((w) => w.type === type)
    if (!def) return

    const { x, y } = findPlacement({
      items: widgets,
      cols: GRID_COLS,
      w: def.defaultW,
      h: def.defaultH,
    })

    const res = await fetch('/api/dashboards/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        x,
        y,
        w: def.defaultW,
        h: def.defaultH,
      }),
    })

    if (!res.ok) return

    const { data: widget } = await res.json()
    if (!widget) return

    setWidgets((prev) => [
      ...prev,
      { id: widget.id, type: widget.type, x: widget.x, y: widget.y, w: widget.w, h: widget.h },
    ])
  }

  async function removeWidget(id: string) {
    await fetch(`/api/dashboards/widgets/${id}`, { method: 'DELETE' })
    setWidgets((prev) => prev.filter((w) => w.id !== id))
  }

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <AddWidgetDialog existingTypes={widgets.map((w) => w.type)} onAdd={addWidget} />
          )}
          <Button
            variant={editing ? 'save' : 'action'}
            size="sm"
            className="rounded-full"
            onClick={editing ? saveLayout : () => setEditing(true)}
          >
            {editing ? (
              <>
                <Check className="mr-1.5 size-4 transition-transform duration-200 group-hover/button:scale-110" />
                Salvar Layout
              </>
            ) : (
              <>
                <Pencil className="mr-1.5 size-4 transition-transform duration-200 group-hover/button:-rotate-12" />
                Editar Layout
              </>
            )}
          </Button>
        </div>
      </div>

      <ResponsiveGridLayout
        className="layout"
        width={containerWidth}
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={50}
        dragConfig={{ enabled: editing, handle: '.drag-handle' }}
        resizeConfig={{ enabled: editing }}
        onLayoutChange={handleLayoutChange}
        margin={[16, 16]}
      >
        {widgets.map((widget) => {
          const Component = widgetComponents[widget.type]
          if (!Component) return null

          return (
            <div key={widget.id} className="relative">
              {editing && (
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                  <div className="drag-handle bg-background/90 border-border/60 flex size-7 cursor-grab items-center justify-center rounded-lg border shadow-sm backdrop-blur">
                    <GripVertical className="text-muted-foreground size-3.5" />
                  </div>
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="flex size-7 items-center justify-center rounded-lg bg-red-100/90 shadow-sm backdrop-blur transition-colors hover:bg-red-200 dark:bg-red-950/70 dark:hover:bg-red-900/80"
                  >
                    <X className="size-3.5 text-red-600 dark:text-red-400" />
                  </button>
                </div>
              )}
              <Component data={data} />
            </div>
          )
        })}
      </ResponsiveGridLayout>
    </div>
  )
}
