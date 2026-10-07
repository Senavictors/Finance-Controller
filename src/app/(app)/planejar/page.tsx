import type { Metadata } from 'next'
import { Target } from 'lucide-react'

import { EmptyState } from '@/components/fc'
import { ScreenHeader } from '@/components/shell'

export const metadata: Metadata = { title: 'Planejar' }

export default function PlanejarPage() {
  return (
    <>
      <ScreenHeader title="Planejar" />
      <EmptyState
        icon={<Target />}
        title="Em breve"
        description="Aqui você vai planejar a renda do ciclo, o orçamento, as dívidas e as metas."
      />
    </>
  )
}
