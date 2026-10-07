import type { Metadata } from 'next'
import { ReceiptText } from 'lucide-react'

import { EmptyState } from '@/components/fc'
import { ScreenHeader } from '@/components/shell'

export const metadata: Metadata = { title: 'Lançamentos' }

export default function LancamentosPage() {
  return (
    <>
      <ScreenHeader title="Lançamentos" />
      <EmptyState
        icon={<ReceiptText />}
        title="Em breve"
        description="Aqui ficam seus lançamentos e a Inbox de revisão."
      />
    </>
  )
}
