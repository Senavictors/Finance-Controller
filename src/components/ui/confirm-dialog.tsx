'use client'

import { useCallback, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && pending) {
        pending.resolve(false)
        setPending(null)
      }
    },
    [pending],
  )

  const handleCancel = useCallback(() => {
    if (!pending) return
    pending.resolve(false)
    setPending(null)
  }, [pending])

  const handleConfirm = useCallback(() => {
    if (!pending) return
    pending.resolve(true)
    setPending(null)
  }, [pending])

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={handleOpenChange}>
      {pending && (
        <DialogContent>
          <DialogHeader>
            <div className="flex items-start gap-3">
              {pending.destructive && (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  <AlertTriangle className="size-4" />
                </div>
              )}
              <div className="flex-1 space-y-1.5">
                <DialogTitle>{pending.title}</DialogTitle>
                {pending.description && (
                  <DialogDescription>{pending.description}</DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              {pending.cancelText ?? 'Cancelar'}
            </Button>
            <Button
              type="button"
              variant={pending.destructive ? 'destructive' : 'default'}
              size="sm"
              onClick={handleConfirm}
            >
              {pending.confirmText ?? (pending.destructive ? 'Excluir' : 'Confirmar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )

  return { confirm, ConfirmDialog: dialog }
}
