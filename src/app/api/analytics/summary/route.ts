import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()

    const monthParam = request.nextUrl.searchParams.get('month')
    const now = new Date()
    let year = now.getFullYear()
    let month = now.getMonth() + 1

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      ;[year, month] = monthParam.split('-').map(Number)
    }

    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 0, 23, 59, 59, 999)

    const prevFrom = new Date(year, month - 2, 1)
    const prevTo = new Date(year, month - 1, 0, 23, 59, 59, 999)

    const [transactions, prevTransactions, accounts, recentTransactions] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, date: { gte: from, lte: to } },
        select: { type: true, amount: true, categoryId: true, accountId: true },
      }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: prevFrom, lte: prevTo } },
        select: { type: true, amount: true },
      }),
      prisma.account.findMany({
        where: { userId, isArchived: false },
        select: { id: true, name: true, color: true, initialBalance: true, type: true },
      }),
      prisma.transaction.findMany({
        where: { userId },
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
      .reduce((sum, t) => sum + t.amount, 0)
    const totalExpenses = transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0)
    const balance = totalIncome - totalExpenses

    const prevIncome = prevTransactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0)
    const prevExpenses = prevTransactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0)

    const incomeVariation = prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome) * 100 : 0
    const expenseVariation =
      prevExpenses > 0 ? ((totalExpenses - prevExpenses) / prevExpenses) * 100 : 0

    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, color: true, type: true },
    })

    const expensesByCategory = categories
      .filter((c) => c.type === 'EXPENSE')
      .map((cat) => {
        const total = transactions
          .filter((t) => t.categoryId === cat.id && t.type === 'EXPENSE')
          .reduce((sum, t) => sum + t.amount, 0)
        return { id: cat.id, name: cat.name, color: cat.color, total }
      })
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)

    const balanceByAccount = accounts.map((acc) => {
      const accTx = transactions.filter((t) => t.accountId === acc.id)
      const income = accTx.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0)
      const expenses = accTx.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0)
      return {
        id: acc.id,
        name: acc.name,
        color: acc.color,
        type: acc.type,
        balance: acc.initialBalance + income - expenses,
      }
    })

    return NextResponse.json({
      data: {
        totalIncome,
        totalExpenses,
        balance,
        incomeVariation: Math.round(incomeVariation * 10) / 10,
        expenseVariation: Math.round(expenseVariation * 10) / 10,
        transactionCount: transactions.length,
        balanceByAccount,
        expensesByCategory,
        recentTransactions,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
