import * as React from 'react'

import { cn } from '@/lib/utils'

export type ListRowProps = {
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  /** Quando presente, a linha inteira vira um botão. */
  onPress?: () => void
  /** Divisor inferior `--fc-divider` (padrão: true; some na última linha do contêiner). */
  divider?: boolean
  className?: string
}

/**
 * Linha padrão de listas. Altura mínima 56px. Sem vidro: não usa backdrop-filter,
 * para não pesar em listas longas; coloque as linhas dentro de um único GlassCard.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  divider = true,
  className,
}: ListRowProps) {
  const classes = cn(
    'flex min-h-14 w-full items-center gap-3 py-2 text-left',
    divider && 'border-b border-fc-divider last:border-b-0',
    onPress &&
      'transition-colors duration-(--fc-dur-fast) ease-fc active:bg-fc-glass-strong outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fc-iris',
    className,
  )

  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="fc-text-body text-fc-text truncate">{title}</span>
        {subtitle ? <span className="fc-text-sub text-fc-text-2 truncate">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-right">{trailing}</span> : null}
    </>
  )

  if (onPress) {
    return (
      <button type="button" data-slot="list-row" onClick={onPress} className={classes}>
        {body}
      </button>
    )
  }

  return (
    <div data-slot="list-row" className={classes}>
      {body}
    </div>
  )
}
