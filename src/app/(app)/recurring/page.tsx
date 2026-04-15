import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { RecurringList } from './recurring-list'
import { RecurringForm } from './recurring-form'
import { ApplyButton } from './apply-button'
import { RefreshCw } from 'lucide-react'

export default async function RecurringPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const [rules, accounts, categories] = await Promise.all([
    prisma.recurringRule.findMany({
      where: { userId: session.userId },
      include: {
        account: { select: { name: true, color: true } },
        category: { select: { name: true, color: true } },
        _count: { select: { logs: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.account.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Recorrencias</h1>
        <div className="flex items-center gap-2">
          <ApplyButton />
          <RecurringForm accounts={accounts} categories={categories} />
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center justify-center rounded-3xl border border-dashed py-16">
          <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
            <RefreshCw className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground mt-4 text-sm font-medium">Nenhuma regra recorrente</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Crie regras para automatizar transacoes repetitivas
          </p>
        </div>
      ) : (
        <RecurringList rules={rules} accounts={accounts} categories={categories} />
      )}
    </div>
  )
}
