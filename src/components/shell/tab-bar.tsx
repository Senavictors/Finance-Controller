'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { GlassCard } from '@/components/fc'
import { cn } from '@/lib/utils'

import { useCapture } from './capture-provider'
import { NavIcon } from './nav-icons'
import { activeTabKey, TAB_ITEMS } from './nav-items'
import { useKeyboardOpen } from './use-keyboard-open'

const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-iris'

/**
 * Tab bar de vidro (ADR-017): Hoje, Lançamentos, + , Planejar, Cartões.
 * O `+` nunca navega: abre o sheet de captura global (RN-02). `Mais` fica fora da barra.
 */
export function TabBar() {
  const pathname = usePathname()
  const active = activeTabKey(pathname)
  const { open } = useCapture()
  const keyboardOpen = useKeyboardOpen()

  return (
    <nav
      aria-label="Principal"
      data-slot="tab-bar"
      data-hidden={keyboardOpen || undefined}
      className="fc-shell-bar"
    >
      <GlassCard variant="bar" padding="none" className="fc-tabbar grid grid-cols-5 items-center">
        {TAB_ITEMS.map((item) => {
          if (item.href === null) {
            return (
              <div key={item.key} className="flex items-center justify-center">
                <button
                  type="button"
                  aria-label="Novo lançamento"
                  aria-haspopup="dialog"
                  onClick={open}
                  className={cn(
                    'rounded-fc-pill bg-fc-iris text-fc-text-on-accent shadow-fc-glow grid size-14 -translate-y-3.5 place-items-center',
                    'ease-fc-spring transition-[scale,background-color] duration-(--fc-dur-fast)',
                    'hover:bg-fc-iris-hi active:bg-fc-iris-lo active:scale-95',
                    focusRing,
                  )}
                >
                  <NavIcon name={item.icon} className="size-7" />
                </button>
              </div>
            )
          }

          const isActive = active === item.key
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'min-h-fc-touch rounded-fc-md relative flex h-full flex-col items-center justify-center gap-1',
                'ease-fc transition-colors duration-(--fc-dur-fast)',
                isActive ? 'text-fc-iris-hi' : 'text-fc-text-3 hover:text-fc-text-2',
                focusRing,
              )}
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="rounded-fc-pill bg-fc-iris-hi absolute top-1.5 h-0.5 w-6"
                />
              ) : null}
              <NavIcon name={item.icon} className="size-6" />
              <span className="fc-tab-label">{item.label}</span>
            </Link>
          )
        })}
      </GlassCard>
    </nav>
  )
}
