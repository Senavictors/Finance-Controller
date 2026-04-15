import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'
import { DashboardClient } from './dashboard-client'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DashboardPage({ searchParams }: Props) {
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
  const prevFrom = new Date(year, month - 2, 1)
  const prevTo = new Date(year, month - 1, 0, 23, 59, 59, 999)

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  })

  const [transactions, prevTransactions, accounts, categories, recentTx] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: session.userId, date: { gte: from, lte: to } },
      select: { type: true, amount: true, categoryId: true, accountId: true },
    }),
    prisma.transaction.findMany({
      where: { userId: session.userId, date: { gte: prevFrom, lte: prevTo } },
      select: { type: true, amount: true },
    }),
    prisma.account.findMany({
      where: { userId: session.userId, isArchived: false },
      select: { id: true, name: true, color: true, initialBalance: true },
    }),
    prisma.category.findMany({
      where: { userId: session.userId, type: 'EXPENSE' },
      select: { id: true, name: true, color: true },
    }),
    prisma.transaction.findMany({
      where: { userId: session.userId },
      include: {
        account: { select: { name: true, color: true } },
        category: { select: { name: true, color: true } },
      },
      orderBy: { date: 'desc' },
      take: 5,
    }),
  ])

  const totalIncome = transactions
    .filter((t) => t.type === 'INCOME')
    .reduce((s, t) => s + t.amount, 0)
  const totalExpenses = transactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((s, t) => s + t.amount, 0)
  const prevIncome = prevTransactions
    .filter((t) => t.type === 'INCOME')
    .reduce((s, t) => s + t.amount, 0)
  const prevExpenses = prevTransactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((s, t) => s + t.amount, 0)

  const incomeVar =
    prevIncome > 0 ? Math.round(((totalIncome - prevIncome) / prevIncome) * 1000) / 10 : 0
  const expenseVar =
    prevExpenses > 0 ? Math.round(((totalExpenses - prevExpenses) / prevExpenses) * 1000) / 10 : 0

  const expensesByCategory = categories
    .map((cat) => ({
      name: cat.name,
      color: cat.color ?? '#94a3b8',
      value: transactions
        .filter((t) => t.categoryId === cat.id && t.type === 'EXPENSE')
        .reduce((s, t) => s + t.amount, 0),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)

  const balanceByAccount = accounts.map((acc) => {
    const accTx = transactions.filter((t) => t.accountId === acc.id)
    const inc = accTx.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0)
    const exp = accTx.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0)
    return {
      name: acc.name,
      color: acc.color ?? '#3b82f6',
      balance: acc.initialBalance + inc - exp,
    }
  })

  return (
    <DashboardClient
      userName={user?.name ?? 'Usuario'}
      totalIncome={totalIncome}
      totalExpenses={totalExpenses}
      incomeVariation={incomeVar}
      expenseVariation={expenseVar}
      transactionCount={transactions.length}
      expensesByCategory={expensesByCategory}
      balanceByAccount={balanceByAccount}
      recentTransactions={recentTx.map((tx) => ({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        date: tx.date.toISOString(),
        account: tx.account,
        category: tx.category,
      }))}
    />
  )
}
