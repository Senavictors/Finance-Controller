'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle, Info, AlertOctagon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardData } from './types'

const severityClasses = {
  CRITICAL: 'bg-red-50 border-red-200 text-red-900',
  WARNING: 'bg-amber-50 border-amber-200 text-amber-900',
  INFO: 'bg-sky-50 border-sky-200 text-sky-900',
} as const

const severityIcons = {
  CRITICAL: AlertOctagon,
  WARNING: AlertTriangle,
  INFO: Info,
} as const

export function InsightsWidget({ data }: { data: DashboardData }) {
  const { insights } = data
  const router = useRouter()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = insights.filter((i) => !dismissed.has(i.id || i.key)).slice(0, 5)

  async function handleDismiss(id: string, fallbackKey: string) {
    setDismissed((prev) => new Set(prev).add(id || fallbackKey))
    if (id) {
      await fetch(`/api/analytics/insights/${id}/dismiss`, { method: 'PATCH' })
      router.refresh()
    }
  }

  return (
    <div className="flex h-full flex-col rounded-[2rem] border border-white/50 bg-[#F2F2F2] p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">Insights</h3>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-gray-600">
          {visible.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-[12px] text-gray-500">
          Nenhum insight relevante no momento. Tudo sob controle.
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {visible.map((insight) => {
            const Icon = severityIcons[insight.severity]
            const body = (
              <div className="flex gap-2">
                <Icon className="mt-0.5 size-3.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] leading-tight font-semibold">{insight.title}</p>
                  <p className="mt-1 text-[11px] leading-snug opacity-80">{insight.body}</p>
                  {insight.cta?.href && (
                    <p className="mt-1 text-[11px] font-medium underline-offset-2 group-hover:underline">
                      {insight.cta.label} →
                    </p>
                  )}
                </div>
              </div>
            )
            return (
              <div
                key={insight.id || insight.key + insight.scopeId}
                className={cn(
                  'group relative rounded-xl border p-2.5 pr-7',
                  severityClasses[insight.severity],
                )}
              >
                {insight.cta?.href ? (
                  <Link href={insight.cta.href} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
                {insight.id && (
                  <button
                    onClick={() => handleDismiss(insight.id, insight.key)}
                    aria-label="Dispensar insight"
                    className="absolute top-1.5 right-1.5 rounded-md p-1 opacity-50 transition-opacity hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
