import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { syncCreditCardStatementsForAccount } from '@/server/modules/finance/application/credit-card/billing'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

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
        },
      }),
      prisma.account.create({
        data: { userId, name: 'Itau', type: 'CHECKING', initialBalance: 1245000, color: '#f97316' },
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

    // Create sample transactions for last 2 months
    const now = new Date()
    const txData = []

    for (let m = 0; m < 2; m++) {
      const d = (day: number) => new Date(now.getFullYear(), now.getMonth() - m, day)

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

      if (m === 0) {
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

    const valid = txData.filter((t) => t.date <= now)
    await prisma.transaction.createMany({ data: valid })
    await syncCreditCardStatementsForAccount(cartaoNubank.id)

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
