import type { Metadata } from 'next'
import {
  ChartColumn,
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

/** Destinos futuros; ainda sem rota (não criar rotas além das 5 abas). */
const MORE_DESTINATIONS: ReadonlyArray<{ label: string; icon: LucideIcon }> = [
  { label: 'Relatórios', icon: ChartColumn },
  { label: 'Contas', icon: Wallet },
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
        {MORE_DESTINATIONS.map(({ label, icon: Icon }) => (
          <ListRow
            key={label}
            leading={<Icon aria-hidden="true" className="text-fc-text-2 size-5" />}
            title={label}
            trailing={<Chip>Em breve</Chip>}
            className="opacity-70"
          />
        ))}
      </GlassCard>
    </>
  )
}
