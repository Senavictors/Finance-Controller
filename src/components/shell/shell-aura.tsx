'use client'

import { usePathname } from 'next/navigation'

import { Aura } from '@/components/fc'

import { activeTabKey } from './nav-items'

/**
 * Aura suave no topo, só em `/hoje`. O estado (calm/tense/hot) passa a ser controlado
 * pelo Hero na F3-04; até lá é sempre `calm`.
 */
export function ShellAura() {
  const pathname = usePathname()
  if (activeTabKey(pathname) !== 'hoje') return null

  return (
    <div data-slot="shell-aura" aria-hidden="true" className="fc-shell-aura">
      <Aura state="calm" />
    </div>
  )
}
