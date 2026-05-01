import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { RecurringList } from './recurring-list'
import { RecurringForm } from './recurring-form'
import { RecurringStats } from './recurring-stats'
import { getNextOccurrence } from './recurring-utils'
import { RefreshCw } from 'lucide-react'

export default async function RecurringPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const [rules, accounts, categories] = await Promise.all([
    prisma.recurringRule.findMany({
      where: { userId: session.userId },
      include: {
        account: { select: { name: true, color: true, icon: true } },
        category: { select: { name: true, color: true, icon: true } },
        _count: { select: { logs: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.account.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true, color: true, icon: true },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true, type: true, color: true, icon: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const rulesWithNext = rules.map((rule) => ({
    ...rule,
    startDate: rule.startDate.toISOString(),
    endDate: rule.endDate?.toISOString() ?? null,
    lastApplied: rule.lastApplied?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    nextDateIso: getNextOccurrence(rule)?.toISOString() ?? null,
  }))

  const activeRules = rulesWithNext.filter((r) => r.isActive)

  const totalMonthly = activeRules.reduce((sum, r) => {
    if (r.type !== 'EXPENSE') return sum
    const monthly =
      r.frequency === 'MONTHLY'
        ? r.amount
        : r.frequency === 'YEARLY'
          ? Math.round(r.amount / 12)
          : r.frequency === 'WEEKLY'
            ? Math.round(r.amount * 4.33)
            : r.frequency === 'DAILY'
              ? r.amount * 30
              : 0
    return sum + monthly
  }, 0)

  const nextCharge = [...activeRules]
    .filter((r) => r.nextDateIso !== null)
    .sort((a, b) => a.nextDateIso!.localeCompare(b.nextDateIso!))
    .map((r) => ({ description: r.description, nextDateIso: r.nextDateIso! }))[0] ?? null

  const activeCount = activeRules.length

  const categoriesCount = new Set(activeRules.map((r) => r.categoryId).filter(Boolean)).size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recorrências</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Gerencie suas cobranças recorrentes de forma simples e eficiente.
        </p>
      </div>

      <RecurringStats
        totalMonthly={totalMonthly}
        nextCharge={nextCharge}
        activeCount={activeCount}
        categoriesCount={categoriesCount}
      />

      {rulesWithNext.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center justify-center rounded-3xl border border-dashed py-16">
          <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
            <RefreshCw className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground mt-4 text-sm font-medium">Nenhuma regra recorrente</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Crie regras para automatizar transações repetitivas
          </p>
          <div className="mt-6">
            <RecurringForm accounts={accounts} categories={categories} />
          </div>
        </div>
      ) : (
        <RecurringList rules={rulesWithNext} accounts={accounts} categories={categories} />
      )}
    </div>
  )
}
