import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 select-none',
    'min-h-fc-touch border font-sans fc-text-label whitespace-nowrap',
    'transition-[scale,background-color,opacity] duration-(--fc-dur-fast) ease-fc-spring',
    'active:scale-[0.97]',
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-iris',
    'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'border-fc-iris bg-fc-iris text-fc-text-on-accent shadow-fc-glow hover:bg-fc-iris-hi active:bg-fc-iris-lo',
        glass: 'border-fc-rim bg-fc-glass-strong text-fc-text hover:bg-fc-glass active:bg-fc-glass',
        ghost:
          'border-fc-void/0 text-fc-text-2 hover:bg-fc-glass hover:text-fc-text active:bg-fc-glass-strong',
        danger: 'border-fc-out/30 bg-fc-out/15 text-fc-out hover:bg-fc-out/25 active:bg-fc-out/25',
      },
      size: {
        md: 'rounded-fc-md px-5',
        lg: 'min-h-14 rounded-fc-md px-6',
        icon: 'size-fc-touch rounded-fc-md p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = React.ComponentPropsWithoutRef<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Desabilita e mostra spinner; mantém a largura do rótulo. */
    loading?: boolean
    /** Aplica o estilo ao único filho (ex.: `<Link>`), sem renderizar um `<button>`. */
    asChild?: boolean
  }

/**
 * Botão FC. Alvo mínimo `--fc-touch-min`, foco visível, escala 0.97 em `:active`.
 * Sem Vibration API (inexistente no Safari iOS): o feedback é visual.
 */
export function Button({
  className,
  variant,
  size,
  loading = false,
  asChild = false,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className)

  if (asChild && React.isValidElement<{ className?: string }>(children)) {
    return React.cloneElement(children, {
      ...props,
      className: cn(classes, children.props.className),
      'data-slot': 'button',
    } as React.HTMLAttributes<HTMLElement>)
  }

  return (
    <button
      data-slot="button"
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="fc-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export { buttonVariants }
