import { redirect } from 'next/navigation'
import { Target } from 'lucide-react'
import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { listGoalsWithProgress } from '@/server/modules/finance/application/goals'
import { isValidMonthParam } from '@/server/modules/finance/application/analytics'
import { GoalForm } from './goal-form'
import { GoalCard } from './goal-card'

type Props = { searchParams: Promise<{ month?: string }> }

export default async function GoalsPage({ searchParams }: Props) {
  const session = await validateSession()
  if (!session) redirect('/login')

  const { month } = await searchParams
  const monthParam = isValidMonthParam(month) ? month : undefined

  const [goalsWithProgress, categories, accounts] = await Promise.all([
    listGoalsWithProgress(session.userId, monthParam),
    prisma.category.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    }),
    prisma.account.findMany({
      where: { userId: session.userId, isArchived: false },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const onTrack = goalsWithProgress.filter((g) => ['ON_TRACK', 'ACHIEVED'].includes(g.status))
  const atRisk = goalsWithProgress.filter((g) =>
    ['WARNING', 'AT_RISK', 'EXCEEDED'].includes(g.status),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex size-10 items-center justify-center rounded-xl">
            <Target className="text-primary size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Metas Financeiras</h1>
            <p className="text-sm text-gray-500">
              {goalsWithProgress.length === 0
                ? 'Nenhuma meta ativa'
                : `${goalsWithProgress.length} meta${goalsWithProgress.length !== 1 ? 's' : ''} ativa${goalsWithProgress.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <GoalForm categories={categories} accounts={accounts} />
      </div>

      {goalsWithProgress.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center">
          <Target className="mb-3 size-10 text-gray-300" />
          <p className="font-medium text-gray-600">Nenhuma meta criada</p>
          <p className="mt-1 text-sm text-gray-400">
            Crie sua primeira meta financeira para acompanhar seu progresso.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {atRisk.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-gray-500 uppercase">
                Requer atencao ({atRisk.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {atRisk.map((goal) => (
                  <GoalCard key={goal.goalId} goal={goal} />
                ))}
              </div>
            </section>
          )}

          {onTrack.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-gray-500 uppercase">
                No ritmo ({onTrack.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {onTrack.map((goal) => (
                  <GoalCard key={goal.goalId} goal={goal} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
