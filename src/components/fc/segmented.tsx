'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export type SegmentedOption<T extends string = string> = {
  value: T
  label: React.ReactNode
}

export type SegmentedProps<T extends string = string> = {
  /** 2 a 4 opções; acima disso use um menu. */
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Rótulo acessível do grupo (VoiceOver). */
  label?: string
  className?: string
}

/**
 * Controle segmentado com indicador deslizante (apenas `transform`).
 * `role="tablist"`; setas esquerda/direita (e Home/End) movem a seleção.
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps<T>) {
  const groupId = React.useId()
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  const select = (index: number) => {
    const next = options[(index + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    tabRefs.current[(index + options.length) % options.length]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        select(selectedIndex + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        select(selectedIndex - 1)
        break
      case 'Home':
        event.preventDefault()
        select(0)
        break
      case 'End':
        event.preventDefault()
        select(options.length - 1)
        break
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      data-slot="segmented"
      onKeyDown={onKeyDown}
      style={
        {
          '--fc-seg-n': options.length,
          '--fc-seg-i': selectedIndex,
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        } as React.CSSProperties
      }
      className={cn(
        'rounded-fc-pill border-fc-rim bg-fc-glass relative grid border p-1',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="fc-seg-indicator rounded-fc-pill border-fc-rim bg-fc-glass-strong border"
      />
      {options.map((option, index) => {
        const selected = index === selectedIndex
        return (
          <button
            key={option.value}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            id={`${groupId}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'fc-text-label min-h-fc-touch rounded-fc-pill relative -my-1 inline-flex items-center justify-center px-3',
              'ease-fc transition-colors duration-(--fc-dur-fast)',
              'focus-visible:outline-fc-iris outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
              selected ? 'text-fc-text' : 'text-fc-text-2 hover:text-fc-text',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
