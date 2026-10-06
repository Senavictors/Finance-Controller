import * as React from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ChipTone = 'neutral' | 'in' | 'out' | 'pend' | 'info' | 'debt'

export type ChipProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'onClick'> & {
  selected?: boolean
  /** Mostra o botão `x`; o alvo de toque do `x` tem 44px. */
  onRemove?: () => void
  /** Rótulo acessível do botão remover (padrão: "Remover"). */
  removeLabel?: string
  /** Aplica cor semântica ao texto e à borda quando não selecionado. */
  tone?: ChipTone
  leading?: React.ReactNode
  /** Quando ausente o chip é só informativo (não é um botão). */
  onPress?: () => void
}

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: 'border-fc-rim text-fc-text-2',
  in: 'border-fc-in/40 text-fc-in',
  out: 'border-fc-out/40 text-fc-out',
  pend: 'border-fc-pend/40 text-fc-pend',
  info: 'border-fc-info/40 text-fc-info',
  debt: 'border-fc-debt/40 text-fc-debt',
}

/**
 * Atributo editável (categoria, valor, conta, data...). Visual de 36px; os botões
 * internos têm 44px de altura (`--fc-touch-min`) e vazam 4px por cima/baixo da pílula.
 */
export function Chip({
  selected = false,
  onRemove,
  removeLabel = 'Remover',
  tone = 'neutral',
  leading,
  onPress,
  className,
  children,
  type = 'button',
  ...props
}: ChipProps) {
  const content = (
    <>
      {leading ? <span className="inline-flex shrink-0 items-center">{leading}</span> : null}
      <span className="min-w-0">{children}</span>
    </>
  )
  const innerClass = 'inline-flex min-h-fc-touch -my-1 items-center gap-1.5'
  const focusClass =
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-iris'

  return (
    <span
      data-slot="chip"
      data-selected={selected || undefined}
      className={cn(
        'fc-text-label rounded-fc-pill inline-flex h-9 max-w-full items-center border pl-3',
        onRemove ? 'pr-1' : 'pr-3',
        selected
          ? 'border-fc-iris bg-fc-iris-soft text-fc-text'
          : cn('bg-fc-glass', TONE_CLASS[tone]),
        className,
      )}
    >
      {onPress ? (
        <button
          type={type}
          aria-pressed={selected}
          onClick={onPress}
          className={cn(innerClass, 'rounded-fc-pill', focusClass)}
          {...props}
        >
          {content}
        </button>
      ) : (
        <span className={innerClass}>{content}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={cn(
            'size-fc-touch rounded-fc-pill -my-1 inline-grid shrink-0 place-items-center',
            'text-fc-text-3 hover:text-fc-text',
            focusClass,
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}
