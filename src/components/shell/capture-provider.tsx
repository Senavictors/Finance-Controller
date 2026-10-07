'use client'

import * as React from 'react'

type CaptureContextValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  setOpen: (open: boolean) => void
}

const CaptureContext = React.createContext<CaptureContextValue | null>(null)

/** Estado do sheet de captura global (FAB `+`, e depois `/`, ⌘K na F2-04). */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false)

  const value = React.useMemo<CaptureContextValue>(
    () => ({
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      setOpen,
    }),
    [isOpen],
  )

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>
}

export function useCapture(): CaptureContextValue {
  const context = React.useContext(CaptureContext)
  if (!context) throw new Error('useCapture deve ser usado dentro de <CaptureProvider>')
  return context
}
