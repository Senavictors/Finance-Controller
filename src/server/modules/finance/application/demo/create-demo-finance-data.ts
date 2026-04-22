import crypto from 'node:crypto'
import { prisma } from '@/server/db'
import {
  advanceCreditCardPurchaseInstallments,
  createCreditCardPurchase,
} from '../credit-card-purchases'
import {
  refreshCreditCardStatement,
  syncCreditCardStatementsForAccount,
} from '../credit-card/billing'

export function createDemoMonthDate(referenceDate: Date, monthOffset: number, day: number) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth() - monthOffset
  const lastDay = new Date(year, month + 1, 0).getDate()

  return new Date(year, month, Math.min(day, lastDay), 12, 0, 0, 0)
}

export async function createDemoFinanceData(userId: string, now = new Date()) {
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
      data: {
        userId,
        name: 'Carteira',
        type: 'WALLET',
        initialBalance: 35000,
        color: '#22c55e',
      },
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
        networkBrandKey: 'mastercard',
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

  const [nubank, itau, carteira, cartaoNubank, investimentos] = accounts

  const incomeCategories = await Promise.all([
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

  const expenseCategories = await Promise.all([
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
      data: { userId, name: 'Educacao', type: 'EXPENSE', color: '#6366f1' },
    }),
    prisma.category.create({
      data: { userId, name: 'Tecnologia', type: 'EXPENSE', color: '#0f766e' },
    }),
    prisma.category.create({
      data: { userId, name: 'Assinaturas', type: 'EXPENSE', color: '#8b5cf6' },
    }),
  ])

  const [salario, freelance, rendimentos] = incomeCategories
  const [alimentacao, transporte, moradia, lazer, saude, educacao, tecnologia] = expenseCategories

  const baseTransactions: Array<{
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

    baseTransactions.push(
      {
        userId,
        accountId: nubank.id,
        categoryId: salario.id,
        type: 'INCOME',
        amount: 850000,
        description: 'Salario mensal',
        date: d(5),
      },
      {
        userId,
        accountId: investimentos.id,
        categoryId: rendimentos.id,
        type: 'INCOME',
        amount: 35000 + monthOffset * 2500,
        description: 'Rendimento mensal',
        date: d(1),
      },
      {
        userId,
        accountId: itau.id,
        categoryId: moradia.id,
        type: 'EXPENSE',
        amount: 220000,
        description: 'Aluguel apartamento',
        date: d(10),
      },
      {
        userId,
        accountId: nubank.id,
        categoryId: saude.id,
        type: 'EXPENSE',
        amount: 12990,
        description: 'Academia SmartFit',
        date: d(5),
      },
      {
        userId,
        accountId: carteira.id,
        categoryId: lazer.id,
        type: 'EXPENSE',
        amount: 12000 + monthOffset * 1500,
        description: ['Cinema', 'Restaurante', 'Bar'][monthOffset % 3],
        date: d(20),
      },
    )

    if (monthOffset !== 1) {
      baseTransactions.push({
        userId,
        accountId: itau.id,
        categoryId: freelance.id,
        type: 'INCOME',
        amount: 180000 + monthOffset * 20000,
        description: 'Projeto freelance',
        date: d(18),
      })
    }
  }

  await prisma.transaction.createMany({
    data: baseTransactions.filter((transaction) => transaction.date <= now),
  })

  await createCreditCardPurchase({
    userId,
    accountId: cartaoNubank.id,
    categoryId: alimentacao.id,
    description: 'Supermercado Zona Sul',
    notes: 'Compra a vista no cartao',
    date: createDemoMonthDate(now, 2, 18),
    amount: 48900,
    installmentCount: 1,
  })

  const notebookPurchase = await createCreditCardPurchase({
    userId,
    accountId: cartaoNubank.id,
    categoryId: tecnologia.id,
    description: 'Notebook gamer',
    notes: 'Compra parcelada para demonstrar o fluxo completo',
    date: createDemoMonthDate(now, 1, 12),
    amount: 359990,
    installmentCount: 6,
  })

  await createCreditCardPurchase({
    userId,
    accountId: cartaoNubank.id,
    categoryId: educacao.id,
    description: 'Curso de ingles',
    notes: 'Plano em 3x',
    date: createDemoMonthDate(now, 0, 6),
    amount: 149700,
    installmentCount: 3,
  })

  await createCreditCardPurchase({
    userId,
    accountId: cartaoNubank.id,
    categoryId: transporte.id,
    description: 'Passagem interestadual',
    notes: 'Compra a vista no cartao',
    date: createDemoMonthDate(now, 0, Math.max(1, now.getDate() - 1)),
    amount: 19900,
    installmentCount: 1,
  })

  const installmentsToAdvance = notebookPurchase.purchase.installments
    .filter((installment) => installment.currentDate > now)
    .slice(0, 2)

  if (installmentsToAdvance.length > 0) {
    await advanceCreditCardPurchaseInstallments(
      notebookPurchase.purchase.id,
      {
        advancedAt: createDemoMonthDate(now, 0, Math.max(1, now.getDate() - 2)),
        notes: 'Adiantamento demo informado manualmente pelo usuario',
        installments: installmentsToAdvance.map((installment, index) => ({
          installmentId: installment.id,
          paidAmount: Math.max(installment.currentAmount - (index + 1) * 1200, 100),
        })),
      },
      userId,
    )
  }

  await Promise.all([
    prisma.recurringRule.create({
      data: {
        userId,
        accountId: nubank.id,
        categoryId: salario.id,
        type: 'INCOME',
        amount: 850000,
        description: 'Salario mensal',
        frequency: 'MONTHLY',
        dayOfMonth: 5,
        startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        isActive: true,
      },
    }),
    prisma.recurringRule.create({
      data: {
        userId,
        accountId: itau.id,
        categoryId: moradia.id,
        type: 'EXPENSE',
        amount: 220000,
        description: 'Aluguel apartamento',
        frequency: 'MONTHLY',
        dayOfMonth: 10,
        startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        isActive: true,
      },
    }),
    prisma.recurringRule.create({
      data: {
        userId,
        accountId: nubank.id,
        categoryId: saude.id,
        type: 'EXPENSE',
        amount: 12990,
        description: 'Academia SmartFit',
        frequency: 'MONTHLY',
        dayOfMonth: 5,
        startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        isActive: true,
      },
    }),
  ])

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
        description: 'Controlar uso do cartao de credito com parcelamento real',
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

  const [techWishlist, homeWishlist, officeWishlist] = await Promise.all([
    prisma.wishlistCategory.create({
      data: { userId, name: 'Tecnologia' },
    }),
    prisma.wishlistCategory.create({
      data: { userId, name: 'Casa' },
    }),
    prisma.wishlistCategory.create({
      data: { userId, name: 'Home Office' },
    }),
  ])

  const wishlistPurchaseDate = createDemoMonthDate(now, 0, Math.max(1, now.getDate() - 3))

  const purchasedWishlistTransaction = await prisma.transaction.create({
    data: {
      userId,
      accountId: nubank.id,
      categoryId: lazer.id,
      type: 'EXPENSE',
      amount: 64990,
      description: 'Headphone Bluetooth',
      notes: 'Compra demo originada da wishlist em conta corrente',
      date: wishlistPurchaseDate,
    },
  })

  const wishlistItemForCardPurchase = await prisma.wishlistItem.create({
    data: {
      userId,
      categoryId: officeWishlist.id,
      name: 'Monitor ultrawide',
      desiredPrice: 329990,
      productUrl: 'https://www.kabum.com.br',
      priority: 'HIGH',
      status: 'READY_TO_BUY',
      desiredPurchaseDate: createDemoMonthDate(now, 0, Math.min(now.getDate() + 5, 28)),
    },
  })

  await Promise.all([
    prisma.wishlistItem.create({
      data: {
        userId,
        categoryId: techWishlist.id,
        name: 'Kindle Paperwhite',
        desiredPrice: 79990,
        productUrl: 'https://www.amazon.com.br',
        priority: 'HIGH',
        status: 'READY_TO_BUY',
        desiredPurchaseDate: createDemoMonthDate(now, 0, Math.min(now.getDate() + 4, 28)),
      },
    }),
    prisma.wishlistItem.create({
      data: {
        userId,
        categoryId: homeWishlist.id,
        name: 'Air Fryer 5L',
        desiredPrice: 45990,
        productUrl: 'https://www.magazineluiza.com.br',
        priority: 'MEDIUM',
        status: 'MONITORING',
        desiredPurchaseDate: new Date(now.getFullYear(), now.getMonth() + 1, 10, 12, 0, 0, 0),
      },
    }),
    prisma.wishlistItem.create({
      data: {
        userId,
        categoryId: officeWishlist.id,
        name: 'Cadeira ergonomica',
        desiredPrice: 119990,
        productUrl: 'https://www.mercadolivre.com.br',
        priority: 'LOW',
        status: 'DESIRED',
        desiredPurchaseDate: new Date(now.getFullYear(), now.getMonth() + 1, 20, 12, 0, 0, 0),
      },
    }),
    prisma.wishlistItem.create({
      data: {
        userId,
        categoryId: officeWishlist.id,
        name: 'Headphone Bluetooth',
        desiredPrice: 69990,
        paidPrice: 64990,
        productUrl: 'https://www.kabum.com.br',
        priority: 'HIGH',
        status: 'PURCHASED',
        desiredPurchaseDate: createDemoMonthDate(now, 0, Math.max(1, now.getDate() - 10)),
        purchasedAt: wishlistPurchaseDate,
        purchaseTransactionId: purchasedWishlistTransaction.id,
      },
    }),
  ])

  await createCreditCardPurchase({
    userId,
    accountId: cartaoNubank.id,
    categoryId: tecnologia.id,
    description: wishlistItemForCardPurchase.name,
    notes: 'Compra demo originada da wishlist e parcelada no cartao',
    date: createDemoMonthDate(now, 0, Math.max(2, now.getDate() - 6)),
    amount: 299990,
    installmentCount: 10,
    source: 'WISHLIST',
    wishlistItemId: wishlistItemForCardPurchase.id,
  })

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
}
