'use client'

import { Sheet } from '@/components/fc'

import { useCapture } from './capture-provider'

/** Stub da captura global; a captura real (campo único + chips) chega na F2-04. */
export function CaptureSheetStub() {
  const { isOpen, setOpen } = useCapture()

  return (
    <Sheet open={isOpen} onOpenChange={setOpen} title="Novo lançamento">
      <p className="fc-text-body text-fc-text-2 py-4">A captura chega na F2-04.</p>
    </Sheet>
  )
}
