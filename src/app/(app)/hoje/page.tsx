import type { Metadata } from 'next'
import { Sun } from 'lucide-react'

import { EmptyState } from '@/components/fc'
import { ScreenHeader } from '@/components/shell'

export const metadata: Metadata = { title: 'Hoje' }

export default function HojePage() {
  return (
    <>
      <ScreenHeader title="Hoje" />
      <EmptyState
        icon={<Sun />}
        title="Em breve"
        description="Aqui você vai ver quanto pode gastar, o que vence e o que precisa de revisão."
      />
    </>
  )
}
