import type { Metadata } from 'next'
import { CreditCard } from 'lucide-react'

import { EmptyState } from '@/components/fc'
import { ScreenHeader } from '@/components/shell'

export const metadata: Metadata = { title: 'Cartões' }

export default function CartoesPage() {
  return (
    <>
      <ScreenHeader title="Cartões" />
      <EmptyState
        icon={<CreditCard />}
        title="Em breve"
        description="Aqui você vai ver faturas, vencimentos e parcelas dos cartões."
      />
    </>
  )
}
