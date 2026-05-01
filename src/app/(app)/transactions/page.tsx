import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import {
  isValidMonthParam,
  resolveMonthPeriod,
} from '@/server/modules/finance/application/analytics'
import { redirect } from 'next/navigation'
import { TransactionTable } from './transaction-table'
import { TransactionFilters } from './transaction-filters'
import { TransactionForm } from './transaction-form'
import { TransactionStats } from './transaction-stats'
import { Pagination } from './pagination'
import { ArrowLeftRight } from 'lucide-react'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TransactionsPage({ searchParams }: Props) {
  const session = await validateSession()
  if (!session) redirect('/login')
  const params = await searchParams

  const monthParam =
    typeof params.month === 'string' && isValidMonthParam(params.month) ? params.month : null
  const { from, to } = resolveMonthPeriod(monthParam)

  const accountId = typeof params.accountId === 'string' ? params.accountId : undefined
  const categoryId = typeof params.categoryId === 'string' ? params.categoryId : undefined
  const q = typeof params.q === 'string' ? params.q : undefined
  const page = typeof params.page === 'string' ? Math.max(1, parseInt(params.page)) : 1
  const limit = 20

  const where = {
    userId: session.userId,
    date: { gte: from, lte: to },
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  const [transactions, total, accounts, categories, typeStats] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        account: { select: { name: true, color: true, icon: true } },
        category: { select: { name: true, color: true, icon: true } },
        creditCardStatement: { select: { id: true, dueDate: true } },
        creditCardPurchaseInstallment: {
          select: {
            id: true,
            installmentNumber: true,
            advanceId: true,
            purchase: {
              select: {
                id: true,
                installmentCount: true,
              },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
    prisma.account.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true, type: true, color: true, icon: true },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { userId: session.userId },
      select: { id: true, name: true, type: true, color: true, icon: true },
      orderBy: { name: 'asc' },
    }),
    prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])

  const incomeRow = typeStats.find((r) => r.type === 'INCOME')
  const expenseRow = typeStats.find((r) => r.type === 'EXPENSE')
  const totalIncome = incomeRow?._sum.amount ?? 0
  const totalExpense = expenseRow?._sum.amount ?? 0
  const incomeCount = incomeRow?._count._all ?? 0
  const expenseCount = expenseRow?._count._all ?? 0
  const balance = totalIncome - totalExpense

  const totalPages = Math.ceil(total / limit)

  const serializedTransactions = transactions.map((tx) => ({
    ...tx,
    date: tx.date.toISOString(),
    creditCardStatement: tx.creditCardStatement
      ? { ...tx.creditCardStatement, dueDate: tx.creditCardStatement.dueDate.toISOString() }
      : null,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Acompanhe e gerencie todas as suas movimentações financeiras.
          </p>
        </div>
        <TransactionForm accounts={accounts} categories={categories} />
      </div>

      <TransactionStats
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        balance={balance}
        totalCount={total}
        incomeCount={incomeCount}
        expenseCount={expenseCount}
      />

      <TransactionFilters accounts={accounts} categories={categories} />

      {transactions.length === 0 ? (
        <div className="border-border/60 flex flex-col items-center justify-center rounded-3xl border border-dashed py-16">
          <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
            <ArrowLeftRight className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground mt-4 text-sm font-medium">
            Nenhuma transação encontrada
          </p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Registre uma transação para começar
          </p>
        </div>
      ) : (
        <div className="border-border/50 bg-card rounded-2xl border shadow-sm">
          <TransactionTable
            transactions={serializedTransactions}
            accounts={accounts}
            categories={categories}
          />
          {totalPages > 1 && (
            <div className="border-border/50 border-t p-4">
              <Pagination currentPage={page} totalPages={totalPages} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
