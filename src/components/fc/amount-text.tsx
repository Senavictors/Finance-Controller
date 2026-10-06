'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { describeAmount, formatAmountText, toneForCents } from '@/components/fc/lib/amount'

export type AmountTone = 'auto' | 'in' | 'out' | 'pend' | 'debt' | 'neutral'
export type AmountSize = 'amount' | 'hero'

export type AmountTextProps = {
  /** Valor em centavos (Int, ADR-002). */
  cents: number
  /** `auto`: positivo = entrada, negativo = saída, zero = texto secundário. */
  tone?: AmountTone
  size?: AmountSize
  /** Mostra `+` em valores positivos (o `-` dos negativos sempre aparece). */
  showSign?: boolean
  /** Modo privacidade: nenhum dígito no DOM. */
  hidden?: boolean
  /** Conta de 0 até o valor em `--fc-dur-count`; instantâneo sob reduced-motion. */
  animate?: boolean
  className?: string
}

const TONE_CLASS = {
  in: 'text-fc-in',
  out: 'text-fc-out',
  pend: 'text-fc-pend',
  debt: 'text-fc-debt',
  neutral: 'text-fc-text',
  zero: 'text-fc-text-2',
} as const

const SIZE_CLASS: Record<AmountSize, string> = {
  amount: 'fc-text-amount',
  hero: 'fc-text-hero',
}

const MASKED_TEXT = 'R$ ••••'

function resolveToneClass(tone: AmountTone, cents: number): string {
  if (tone === 'auto') {
    const auto = toneForCents(cents)
    return auto === 'neutral' ? TONE_CLASS.zero : TONE_CLASS[auto]
  }
  return TONE_CLASS[tone]
}

/** Lê `--fc-dur-count` (ex.: "900ms"); sob reduced-motion o token vale 1ms. */
function readCountDurationMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--fc-dur-count').trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return 0
  return raw.endsWith('ms') ? value : value * 1000
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Único jeito de renderizar dinheiro. Fonte numérica do token (`--fc-font-num`),
 * `tabular-nums`, formato pt-BR/BRL via `formatCurrency`. Leitores de tela recebem
 * o valor completo por extenso numérico; o texto visual fica `aria-hidden`.
 */
export function AmountText({
  cents,
  tone = 'auto',
  size = 'amount',
  showSign = false,
  hidden = false,
  animate = false,
  className,
}: AmountTextProps) {
  const visualRef = React.useRef<HTMLSpanElement>(null)
  const previousCents = React.useRef(0)

  React.useLayoutEffect(() => {
    const node = visualRef.current
    const from = previousCents.current
    previousCents.current = cents
    if (!node || hidden || !animate || !Number.isFinite(cents)) return

    const duration = readCountDurationMs()
    if (prefersReducedMotion() || duration <= 5 || from === cents) return

    let frame = 0
    let start: number | null = null
    const render = (value: number) => {
      node.textContent = formatAmountText(value, { showSign })
    }
    const step = (now: number) => {
      start ??= now
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      render(Math.round(from + (cents - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    render(from)
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = formatAmountText(cents, { showSign })
    }
  }, [cents, animate, hidden, showSign])

  const text = hidden ? MASKED_TEXT : formatAmountText(cents, { showSign })

  return (
    <span
      data-slot="amount-text"
      data-tone={tone}
      className={cn(
        SIZE_CLASS[size],
        resolveToneClass(tone, cents),
        'whitespace-nowrap',
        className,
      )}
    >
      <span ref={visualRef} aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{hidden ? 'Valor oculto' : describeAmount(cents)}</span>
    </span>
  )
}
