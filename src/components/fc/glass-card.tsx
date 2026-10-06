import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const glassCardVariants = cva('fc-glass-surface border border-fc-rim shadow-fc-card', {
  variants: {
    variant: {
      card: 'bg-fc-glass rounded-fc-lg fc-blur-card',
      strong: 'bg-fc-glass-strong rounded-fc-lg fc-blur-card',
      bar: 'bg-fc-glass-bar rounded-fc-xl fc-blur-bar',
      sheet: 'bg-fc-glass-sheet rounded-fc-lg fc-blur-sheet',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: { variant: 'card', padding: 'md' },
})

export type GlassCardElement = 'div' | 'section' | 'article' | 'aside' | 'header' | 'footer' | 'li'

export type GlassCardProps = React.ComponentPropsWithoutRef<'div'> &
  VariantProps<typeof glassCardVariants> & {
    as?: GlassCardElement
  }

/**
 * Contêiner de vidro. Um blur por contêiner: não aninhar GlassCard nem usar em
 * itens de lista longa (performance de `backdrop-filter` no iPhone).
 */
export function GlassCard({
  as: Component = 'div',
  variant,
  padding,
  className,
  ...props
}: GlassCardProps) {
  // Tipado como 'div': os elementos permitidos em `as` compartilham os atributos usados aqui.
  const Element = Component as 'div'
  return (
    <Element
      data-slot="glass-card"
      className={cn(glassCardVariants({ variant, padding }), className)}
      {...props}
    />
  )
}

export { glassCardVariants }
