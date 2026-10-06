'use client'

import * as React from 'react'
import { X } from 'lucide-react'

import { IconButton } from '@/components/fc/icon-button'
import { cn } from '@/lib/utils'
import { Button } from '@/components/fc/button'
import { GlassCard } from '@/components/fc/glass-card'

export type ToastTone = 'neutral' | 'success' | 'info' | 'warning' | 'error'

export type ToastAction = {
  label: string
  onPress: () => void
}

export type ToastOptions = {
  message: string
  tone?: ToastTone
  /** Ação opcional, tipicamente "Desfazer". */
  action?: ToastAction
  /** ms até sumir. Padrão 5000; `null` mantém até fechar. Tom `error` não some sozinho. */
  duration?: number | null
}

type ToastEntry = {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
  duration: number | null
}

/** No máximo 2 toasts empilhados; o mais antigo sai quando chega o terceiro. */
const MAX_VISIBLE = 2
const DEFAULT_DURATION_MS = 5000
const EMPTY: readonly ToastEntry[] = []

let nextId = 1
let entries: readonly ToastEntry[] = EMPTY
const listeners = new Set<() => void>()

function emit(next: readonly ToastEntry[]) {
  entries = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Dispara um toast (store de módulo: funciona sem Provider; monte `<Toaster />` uma vez). */
export function toast(options: ToastOptions): number {
  const tone = options.tone ?? 'neutral'
  const duration =
    options.duration !== undefined
      ? options.duration
      : tone === 'error'
        ? null
        : DEFAULT_DURATION_MS
  const entry: ToastEntry = {
    id: nextId++,
    message: options.message,
    tone,
    action: options.action,
    duration,
  }
  emit([...entries, entry].slice(-MAX_VISIBLE))
  return entry.id
}

export function dismissToast(id: number) {
  emit(entries.filter((entry) => entry.id !== id))
}

export function useToast() {
  return { toast, dismiss: dismissToast }
}

const TONE_DOT: Record<ToastTone, string> = {
  neutral: 'bg-fc-text-3',
  success: 'bg-fc-in',
  info: 'bg-fc-info',
  warning: 'bg-fc-pend',
  error: 'bg-fc-out',
}

function ToastItem({ entry }: { entry: ToastEntry }) {
  const [paused, setPaused] = React.useState(false)
  const { id, duration } = entry

  React.useEffect(() => {
    if (duration === null || paused) return
    const timer = window.setTimeout(() => dismissToast(id), duration)
    return () => window.clearTimeout(timer)
  }, [id, duration, paused])

  return (
    <GlassCard
      variant="bar"
      padding="none"
      data-slot="toast"
      data-tone={entry.tone}
      role={entry.tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fc-toast pointer-events-auto flex min-h-14 w-full max-w-md items-center gap-3 pl-4"
    >
      <span
        aria-hidden="true"
        className={cn('rounded-fc-pill size-2 shrink-0', TONE_DOT[entry.tone])}
      />
      <p className="fc-text-body text-fc-text min-w-0 flex-1 py-3">{entry.message}</p>
      {entry.action ? (
        <Button
          variant="ghost"
          className="text-fc-iris mr-1"
          onClick={() => {
            entry.action?.onPress()
            dismissToast(entry.id)
          }}
        >
          {entry.action.label}
        </Button>
      ) : entry.duration === null ? (
        <IconButton
          variant="ghost"
          label="Fechar aviso"
          icon={<X className="size-4" />}
          onClick={() => dismissToast(entry.id)}
        />
      ) : (
        <span className="w-3 shrink-0" aria-hidden="true" />
      )}
    </GlassCard>
  )
}

/** Monte uma vez no shell do app. Fica abaixo do notch (`safe-area-inset-top`). */
export function Toaster() {
  const current = React.useSyncExternalStore(
    subscribe,
    () => entries,
    () => EMPTY,
  )

  return (
    <div
      data-slot="toaster"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-(--fc-z-toast) flex flex-col items-center gap-2',
        'px-fc-gutter pt-[calc(env(safe-area-inset-top)+var(--fc-space-2))]',
      )}
    >
      {current.map((entry) => (
        <ToastItem key={entry.id} entry={entry} />
      ))}
    </div>
  )
}
