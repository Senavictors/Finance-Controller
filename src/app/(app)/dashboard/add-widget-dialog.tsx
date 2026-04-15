'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { widgetRegistry } from './widgets/registry'

type Props = {
  existingTypes: string[]
  onAdd: (type: string) => void
}

export function AddWidgetDialog({ existingTypes, onAdd }: Props) {
  const [open, setOpen] = useState(false)

  const available = widgetRegistry.filter((w) => !existingTypes.includes(w.type))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm" className="rounded-full">
          <Plus className="mr-1.5 size-4" />
          Adicionar Widget
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Widget</DialogTitle>
          <DialogDescription>Escolha um widget para adicionar ao dashboard</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {available.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Todos os widgets ja estao no dashboard
            </p>
          ) : (
            available.map((widget) => (
              <button
                key={widget.type}
                onClick={() => {
                  onAdd(widget.type)
                  setOpen(false)
                }}
                className="border-border/50 hover:bg-muted/50 flex flex-col gap-0.5 rounded-xl border p-4 text-left transition-colors"
              >
                <span className="text-sm font-medium">{widget.label}</span>
                <span className="text-muted-foreground text-xs">{widget.description}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
