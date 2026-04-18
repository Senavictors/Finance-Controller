import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import {
  refreshCreditCardStatement,
  syncCreditCardStatementsForAccount,
} from '@/server/modules/finance/application/credit-card/billing'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

function createDemoMonthDate(referenceDate: Date, monthOffset: number, day: number) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth() - monthOffset
  const lastDay = new Date(year, month + 1, 0).getDate()

  return new Date(year, month, Math.min(day, lastDay), 12, 0, 0, 0)
}

export async function POST() {
  try {
    const { userId } = await requireAuth()

    // Delete all user data (cascades handle related records)
    await prisma.dashboard.deleteMany({ where: { userId } })
    await prisma.recurringRule.deleteMany({ where: { userId } })
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Recreate demo data
    const accounts = await Promise.all([
      prisma.account.create({
        data: {
          userId,
          name: 'Nubank',
          type: 'CHECKING',
          initialBalance: 523000,
          color: '#3b82f6',
          icon: 'nubank',
        },
      }),
      prisma.account.create({
        data: {
          userId,
          name: 'Itau',
          type: 'CHECKING',
          initialBalance: 1245000,
          color: '#f97316',
          icon: 'itau',
        },
      }),
      prisma.account.create({
        data: { userId, name: 'Carteira', type: 'WALLET', initialBalance: 35000, color: '#22c55e' },
      }),
      prisma.account.create({
        data: {
          userId,
          name: 'Cartao Nubank',
          type: 'CREDIT_CARD',
          initialBalance: 0,
          creditLimit: 650000,
          statementClosingDay: 10,
          statementDueDay: 17,
          color: '#8b5cf6',
          icon: 'nubank',
        },
      }),
      prisma.account.create({
        data: {
          userId,
          name: 'Investimentos',
          type: 'INVESTMENT',
          initialBalance: 2500000,
          color: '#14b8a6',
        },
      }),
    ])

    const [nubank, itau, carteira, cartaoNubank] = accounts

    const incCats = await Promise.all([
      prisma.category.create({
        data: { userId, name: 'Salario', type: 'INCOME', color: '#22c55e' },
      }),
      prisma.category.create({
        data: { userId, name: 'Freelance', type: 'INCOME', color: '#14b8a6' },
      }),
      prisma.category.create({
        data: { userId, name: 'Rendimentos', type: 'INCOME', color: '#0ea5e9' },
      }),
    ])

    const expCats = await Promise.all([
      prisma.category.create({
        data: { userId, name: 'Alimentacao', type: 'EXPENSE', color: '#ef4444' },
      }),
      prisma.category.create({
        data: { userId, name: 'Transporte', type: 'EXPENSE', color: '#f97316' },
      }),
      prisma.category.create({
        data: { userId, name: 'Moradia', type: 'EXPENSE', color: '#a855f7' },
      }),
      prisma.category.create({
        data: { userId, name: 'Lazer', type: 'EXPENSE', color: '#ec4899' },
      }),
      prisma.category.create({
        data: { userId, name: 'Saude', type: 'EXPENSE', color: '#10b981' },
      }),
      prisma.category.create({
        data: { userId, name: 'Assinaturas', type: 'EXPENSE', color: '#8b5cf6' },
      }),
    ])

    const [salario, freelance] = incCats
    const [alimentacao, transporte, moradia, lazer, saude, assinaturas] = expCats

    // Create sample transactions for the last 3 months plus one current-cycle purchase
    const now = new Date()
    const txData: Array<{
      userId: string
      accountId: string
      categoryId: string | null
      type: 'INCOME' | 'EXPENSE'
      amount: number
      description: string
      date: Date
    }> = []

    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const d = (day: number) => createDemoMonthDate(now, monthOffset, day)

      txData.push(
        {
          userId,
          accountId: nubank.id,
          categoryId: salario.id,
          type: 'INCOME' as const,
          amount: 850000,
          description: 'Salario mensal',
          date: d(5),
        },
        {
          userId,
          accountId: itau.id,
          categoryId: moradia.id,
          type: 'EXPENSE' as const,
          amount: 220000,
          description: 'Aluguel',
          date: d(10),
        },
        {
          userId,
          accountId: cartaoNubank.id,
          categoryId: alimentacao.id,
          type: 'EXPENSE' as const,
          amount: 45000,
          description: 'Supermercado',
          date: d(8),
        },
        {
          userId,
          accountId: cartaoNubank.id,
          categoryId: transporte.id,
          type: 'EXPENSE' as const,
          amount: 8500,
          description: 'Uber',
          date: d(12),
        },
        {
          userId,
          accountId: cartaoNubank.id,
          categoryId: assinaturas.id,
          type: 'EXPENSE' as const,
          amount: 5590,
          description: 'Netflix',
          date: d(15),
        },
        {
          userId,
          accountId: cartaoNubank.id,
          categoryId: alimentacao.id,
          type: 'EXPENSE' as const,
          amount: 17990,
          description: 'Padaria do bairro',
          date: d(22),
        },
        {
          userId,
          accountId: nubank.id,
          categoryId: saude.id,
          type: 'EXPENSE' as const,
          amount: 12990,
          description: 'Academia',
          date: d(5),
        },
        {
          userId,
          accountId: carteira.id,
          categoryId: lazer.id,
          type: 'EXPENSE' as const,
          amount: 12000,
          description: 'Restaurante',
          date: d(20),
        },
      )

      if (monthOffset === 0) {
        txData.push({
          userId,
          accountId: itau.id,
          categoryId: freelance.id,
          type: 'INCOME' as const,
          amount: 250000,
          description: 'Projeto freelance',
          date: d(18),
        })
      }
    }

    txData.push({
      userId,
      accountId: cartaoNubank.id,
      categoryId: alimentacao.id,
      type: 'EXPENSE',
      amount: 1890,
      description: 'Cafe da tarde',
      date: new Date(now),
    })

    const valid = txData.filter((t) => t.date <= now)
    await prisma.transaction.createMany({ data: valid })
    await syncCreditCardStatementsForAccount(cartaoNubank.id)

    const statements = await prisma.creditCardStatement.findMany({
      where: { userId, accountId: cartaoNubank.id, totalAmount: { gt: 0 } },
      orderBy: { dueDate: 'asc' },
    })

    const statementToPay = statements.find((statement) => statement.closingDate < now)

    if (statementToPay) {
      const transferId = crypto.randomUUID()
      const paymentDate =
        statementToPay.dueDate < now ? statementToPay.dueDate : new Date(now.getTime())

      await prisma.$transaction([
        prisma.transaction.create({
          data: {
            userId,
            accountId: nubank.id,
            type: 'TRANSFER',
            amount: statementToPay.totalAmount,
            date: paymentDate,
            description: `Pagamento fatura ${cartaoNubank.name}`,
            notes: 'Lancamento demo para exibir uma fatura quitada',
            transferId,
          },
        }),
        prisma.transaction.create({
          data: {
            userId,
            accountId: cartaoNubank.id,
            creditCardStatementId: statementToPay.id,
            type: 'TRANSFER',
            amount: statementToPay.totalAmount,
            date: paymentDate,
            description: `Pagamento fatura ${cartaoNubank.name}`,
            notes: 'Lancamento demo para exibir uma fatura quitada',
            transferId,
          },
        }),
      ])

      await refreshCreditCardStatement(statementToPay.id)
    }

    // Create demo goals
    await Promise.all([
      prisma.goal.create({
        data: {
          userId,
          name: 'Economizar R$ 500 por mes',
          description: 'Meta de economia mensal para reserva de emergencia',
          metric: 'SAVING',
          scopeType: 'GLOBAL',
          targetAmount: 50000,
          period: 'MONTHLY',
          warningPercent: 80,
          dangerPercent: 95,
        },
      }),
      prisma.goal.create({
        data: {
          userId,
          name: 'Limite de gastos com Alimentacao',
          description: 'Manter gastos com alimentacao abaixo de R$ 800',
          metric: 'EXPENSE_LIMIT',
          scopeType: 'CATEGORY',
          categoryId: alimentacao.id,
          targetAmount: 80000,
          period: 'MONTHLY',
          warningPercent: 75,
          dangerPercent: 90,
        },
      }),
      prisma.goal.create({
        data: {
          userId,
          name: 'Limite do Cartao Nubank',
          description: 'Controlar uso do cartao de credito',
          metric: 'ACCOUNT_LIMIT',
          scopeType: 'ACCOUNT',
          accountId: cartaoNubank.id,
          targetAmount: 300000,
          period: 'MONTHLY',
          warningPercent: 70,
          dangerPercent: 90,
        },
      }),
    ])

    // Create dashboard
    await prisma.dashboard.create({
      data: {
        userId,
        widgets: {
          create: [
            { type: 'balance', x: 0, y: 0, w: 5, h: 6 },
            { type: 'income-expenses', x: 5, y: 0, w: 7, h: 6 },
            { type: 'expenses-by-category', x: 0, y: 6, w: 8, h: 5 },
            { type: 'accounts', x: 8, y: 6, w: 4, h: 5 },
            { type: 'recent-transactions', x: 0, y: 11, w: 12, h: 5 },
          ],
        },
      },
    })

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.fullRebuild,
    })

    return NextResponse.json({ success: true, message: 'Dados demo recriados com sucesso' })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
