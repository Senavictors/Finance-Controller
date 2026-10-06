import * as React from 'react'

import { cn } from '@/lib/utils'
import { clampProgress } from '@/components/fc/lib/amount'
import { TONE_CLASS, type ProgressBaseProps } from '@/components/fc/progress-tone'

export type ProgressRingProps = ProgressBaseProps & {
  /** Diâmetro em px. */
  size?: number
  /** Espessura do traço em px. */
  strokeWidth?: number
  children?: React.ReactNode
}

/** Anel de progresso em SVG (`stroke` via `currentColor`); conteúdo opcional ao centro. */
export function ProgressRing({
  value,
  tone = 'iris',
  label,
  size = 72,
  strokeWidth = 8,
  className,
  children,
}: ProgressRingProps) {
  const progress = clampProgress(value)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      data-slot="progress-ring"
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-grid shrink-0 place-items-center',
        TONE_CLASS[tone],
        className,
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-fc-glass-strong"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="stroke-current"
        />
      </svg>
      {children ? <div className="text-fc-text relative">{children}</div> : null}
    </div>
  )
}
