import { cn } from '@/lib/utils'
import { clampProgress } from '@/components/fc/lib/amount'
import { TONE_CLASS, type ProgressBaseProps } from '@/components/fc/progress-tone'

export type ProgressBarProps = ProgressBaseProps & {
  /** Posição 0..1 do "dia ideal" (ritmo do ciclo); omitido = sem marcador. */
  markerAt?: number
}

/** Barra de progresso. O preenchimento anima por `transform: scaleX` (compositor). */
export function ProgressBar({
  value,
  markerAt,
  tone = 'iris',
  label,
  className,
}: ProgressBarProps) {
  const progress = clampProgress(value)
  const marker = markerAt === undefined ? null : clampProgress(markerAt)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuetext={
        marker === null
          ? undefined
          : `${Math.round(progress * 100)}% usado; ritmo ideal ${Math.round(marker * 100)}%`
      }
      data-slot="progress-bar"
      className={cn(
        'rounded-fc-pill bg-fc-glass-strong relative h-2 w-full',
        TONE_CLASS[tone],
        className,
      )}
    >
      <div className="rounded-fc-pill absolute inset-0 overflow-hidden">
        <div
          className="ease-fc h-full w-full origin-left bg-current transition-transform duration-(--fc-dur-base)"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      {marker !== null ? (
        <span
          aria-hidden="true"
          data-slot="progress-marker"
          className="rounded-fc-pill bg-fc-text absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2"
          style={{ left: `${marker * 100}%` }}
        />
      ) : null}
    </div>
  )
}
