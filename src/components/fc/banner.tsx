import * as React from 'react'
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

export type BannerTone = 'info' | 'pend' | 'out' | 'in'

export type BannerProps = {
  tone?: BannerTone
  title: React.ReactNode
  children?: React.ReactNode
  /** Substitui o ícone padrão do tom. */
  icon?: React.ReactNode
  className?: string
}

const TONE: Record<BannerTone, { box: string; icon: React.ReactNode }> = {
  info: { box: 'border-fc-info/30 bg-fc-info/10 text-fc-info', icon: <Info /> },
  pend: { box: 'border-fc-pend/30 bg-fc-pend/10 text-fc-pend', icon: <TriangleAlert /> },
  out: { box: 'border-fc-out/30 bg-fc-out/10 text-fc-out', icon: <OctagonAlert /> },
  in: { box: 'border-fc-in/30 bg-fc-in/10 text-fc-in', icon: <CircleCheck /> },
}

/** Faixa informativa (cheque especial, teto MEI...). A cor sozinha não basta: título em texto. */
export function Banner({ tone = 'info', title, children, icon, className }: BannerProps) {
  const config = TONE[tone]

  return (
    <div
      role={tone === 'out' ? 'alert' : 'note'}
      data-slot="banner"
      data-tone={tone}
      className={cn('rounded-fc-md flex items-start gap-3 border p-4', config.box, className)}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-5">
        {icon ?? config.icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="fc-text-label text-fc-text">{title}</p>
        {children ? <div className="fc-text-sub text-fc-text-2">{children}</div> : null}
      </div>
    </div>
  )
}
