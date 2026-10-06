import * as React from 'react'

import { Button, type ButtonProps } from '@/components/fc/button'

export type IconButtonProps = Omit<
  ButtonProps,
  'size' | 'asChild' | 'children' | 'aria-label' | 'loading'
> & {
  /** Obrigatório: vira `aria-label` (VoiceOver). */
  label: string
  icon: React.ReactNode
}

/** Botão só com ícone, 44x44 (`--fc-touch-min`), variantes de `Button` (padrão `glass`). */
export function IconButton({ label, icon, variant = 'glass', ...props }: IconButtonProps) {
  return (
    <Button size="icon" variant={variant} aria-label={label} {...props}>
      {icon}
    </Button>
  )
}
