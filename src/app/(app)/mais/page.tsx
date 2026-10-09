import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import {
  ChartColumn,
  ChevronRight,
  FileUp,
  Plug,
  SlidersHorizontal,
  Tags,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { Chip, GlassCard, ListRow } from '@/components/fc'
import { ScreenHeader } from '@/components/shell'

export const metadata: Metadata = { title: 'Mais' }

/** Destinos do Mais; sem `href` ainda não existe a tela (aparece como "Em breve"). */
const MORE_DESTINATIONS: ReadonlyArray<{ label: string; icon: LucideIcon; href?: string }> = [
  { label: 'Relatórios', icon: ChartColumn },
  { label: 'Contas', icon: Wallet, href: '/mais/contas' },
  { label: 'Categorias', icon: Tags },
  { label: 'Regras', icon: SlidersHorizontal },
  { label: 'Importar', icon: FileUp },
  { label: 'Integrações', icon: Plug },
  { label: 'Conta', icon: UserRound },
]

export default function MaisPage() {
  return (
    <>
      <ScreenHeader title="Mais" showMore={false} />
      <GlassCard as="section" aria-label="Destinos" padding="none" className="px-4 py-1">
        {MORE_DESTINATIONS.map(({ label, icon: Icon, href }) => {
          const row = (
            <ListRow
              divider={!href}
              leading={<Icon aria-hidden="true" className="text-fc-text-2 size-5" />}
              title={label}
              trailing={
                href ? (
                  <ChevronRight aria-hidden="true" className="text-fc-text-3 size-5" />
                ) : (
                  <Chip>Em breve</Chip>
                )
              }
              className={href ? undefined : 'opacity-70'}
            />
          )
          return href ? (
            <Link
              key={label}
              href={href}
              className="border-fc-divider focus-visible:outline-fc-iris block border-b outline-none last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              {row}
            </Link>
          ) : (
            <Fragment key={label}>{row}</Fragment>
          )
        })}
      </GlassCard>
    </>
  )
}
