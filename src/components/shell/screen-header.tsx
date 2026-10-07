import * as React from 'react'
import Link from 'next/link'

import { Button } from '@/components/fc'

import { NavIcon } from './nav-icons'
import { MORE_ITEM } from './nav-items'

export type ScreenHeaderProps = {
  title: string
  /** Ações da tela, à esquerda do botão Mais. */
  actions?: React.ReactNode
  /** Esconde o botão Mais (a própria rota `/mais`). */
  showMore?: boolean
}

/**
 * Cabeçalho de tela. Com `black-translucent` o conteúdo passa por baixo da status bar:
 * o topo respeita `env(safe-area-inset-top)` (`.pt-safe`).
 */
export function ScreenHeader({ title, actions, showMore = true }: ScreenHeaderProps) {
  return (
    <header data-slot="screen-header" className="pt-safe flex items-center gap-3 pb-4">
      <h1 className="fc-text-title text-fc-text min-w-0 flex-1 truncate">{title}</h1>
      {actions}
      {showMore ? (
        <Button asChild variant="glass" size="icon">
          <Link href={MORE_ITEM.href} aria-label={MORE_ITEM.label}>
            <NavIcon name={MORE_ITEM.icon} className="size-5" />
          </Link>
        </Button>
      ) : null}
    </header>
  )
}
