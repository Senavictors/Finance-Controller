import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { TransactionTable } from './transaction-table'
import { TransactionFilters } from './transaction-filters'
import { TransactionForm } from './transaction-form'
import { Pagination } from './pagination'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TransactionsPage({ searchParams }: Props) {
  const session = await validateSession()
  if (!session) redirect('/login')
  const params = await searchParams

  const monthParam =
    typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month) ? params.month : null
  const now = new Date()
  const year = monthParam ? parseInt(monthParam.split('-')[0]) : now.getFullYear()
  const month = monthParam ? parseInt(monthParam.split('-')[1]) : now.getMonth() + 1
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0, 23, 59, 59, 999)

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

  const [transactions, total, accounts, categories] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        account: { select: { name: true, color: true } },
        category: { select: { name: true, color: true } },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
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

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transacoes</h1>
        <TransactionForm accounts={accounts} categories={categories} />
      </div>

      <TransactionFilters accounts={accounts} categories={categories} />

      {transactions.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma transacao encontrada.</p>
      ) : (
        <>
          <TransactionTable transactions={transactions} />
          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} />}
        </>
      )}
    </div>
  )
}
