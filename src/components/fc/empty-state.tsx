import * as React from 'react'

import { cn } from '@/lib/utils'
import { GlassCard } from '@/components/fc/glass-card'

export type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  /** Normalmente um `Button`. */
  action?: React.ReactNode
  className?: string
}

/** Estado vazio centralizado dentro de um `GlassCard`. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <GlassCard
      data-slot="empty-state"
      padding="lg"
      className={cn('flex flex-col items-center gap-3 text-center', className)}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="rounded-fc-md bg-fc-iris-soft text-fc-iris inline-grid size-14 place-items-center [&_svg]:size-7"
        >
          {icon}
        </span>
      ) : null}
      <h3 className="fc-text-h2 text-fc-text">{title}</h3>
      {description ? <p className="fc-text-sub text-fc-text-2 max-w-xs">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </GlassCard>
  )
}
