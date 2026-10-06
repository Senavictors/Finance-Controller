'use client'

import * as React from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { IconButton } from '@/components/fc/icon-button'

export type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
  /** `auto`: altura do conteúdo; `tall`: quase a tela inteira. */
  snap?: 'auto' | 'tall'
  className?: string
}

/** Arrasto (px) para baixo a partir do qual o sheet fecha. */
const DISMISS_DISTANCE_PX = 80

/**
 * Bottom sheet sobre Base UI Dialog. Fecha com Esc, toque no scrim ou arrasto > 80px
 * pela alça/cabeçalho (o arrasto não conflita com a rolagem do conteúdo). O Dialog
 * prende o foco e o devolve ao elemento de origem ao fechar.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  snap = 'auto',
  className,
}: SheetProps) {
  const popupRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ pointerId: number; startY: number; dy: number } | null>(null)

  const setDragOffset = (value: string) => {
    popupRef.current?.style.setProperty('--fc-sheet-dy', value)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    drag.current = { pointerId: event.pointerId, startY: event.clientY, dy: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
    popupRef.current?.setAttribute('data-dragging', 'true')
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    state.dy = Math.max(0, event.clientY - state.startY)
    setDragOffset(`${state.dy}px`)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    drag.current = null
    popupRef.current?.removeAttribute('data-dragging')
    if (state.dy > DISMISS_DISTANCE_PX && event.type === 'pointerup') {
      setDragOffset('100%')
      onOpenChange(false)
    } else {
      setDragOffset('0px')
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setDragOffset('0px')
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-slot="sheet-scrim"
          className="fc-sheet-backdrop bg-fc-scrim fixed inset-0 z-(--fc-z-scrim)"
        />
        <Dialog.Popup
          ref={popupRef}
          data-slot="sheet"
          data-snap={snap}
          className={cn(
            'fc-sheet-popup fc-glass-surface fc-blur-sheet fixed inset-x-0 bottom-0 z-(--fc-z-sheet)',
            'mx-auto flex w-full max-w-lg flex-col outline-none',
            'rounded-t-fc-sheet border-fc-rim bg-fc-glass-sheet shadow-fc-float border border-b-0',
            snap === 'tall'
              ? 'h-[calc(100dvh-env(safe-area-inset-top)-var(--fc-space-8))]'
              : 'max-h-[85dvh]',
            className,
          )}
        >
          <div
            data-slot="sheet-drag-zone"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
          >
            <div
              aria-hidden="true"
              className="rounded-fc-pill bg-fc-text-3 mx-auto mt-2 h-1 w-10"
            />
            <div className="min-h-fc-touch pl-fc-gutter flex items-center justify-between gap-3 pt-2 pr-2">
              <Dialog.Title className="fc-text-h2 text-fc-text min-w-0 truncate">
                {title}
              </Dialog.Title>
              <Dialog.Close
                render={
                  <IconButton variant="ghost" label="Fechar" icon={<X className="size-5" />} />
                }
              />
            </div>
          </div>
          <div className="px-fc-gutter min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2 pb-[calc(var(--fc-space-4)+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
