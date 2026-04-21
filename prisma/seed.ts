import crypto from 'node:crypto'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'
import {
  getCreditCardStatementCycle,
  getCreditCardStatementStatus,
} from '../src/server/modules/finance/application/credit-card/statement-cycle'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const SALT_ROUNDS = 12

function createDemoMonthDate(referenceDate: Date, monthOffset: number, day: number) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth() - monthOffset
  const lastDay = new Date(year, month + 1, 0).getDate()

  return new Date(year, month, Math.min(day, lastDay), 12, 0, 0, 0)
}

async function refreshCreditCardStatements(accountId: string) {
  const statements = await prisma.creditCardStatement.findMany({
    where: { accountId },
    include: {
      transactions: {
        select: { type: true, amount: true },
      },
    },
  })

  for (const statement of statements) {
    const totalAmount = statement.transactions
      .filter((transaction) => transaction.type === 'EXPENSE')
      .reduce((sum, transaction) => sum + transaction.amount, 0)
    const paidAmount = statement.transactions
      .filter((transaction) => transaction.type === 'TRANSFER')
      .reduce((sum, transaction) => sum + transaction.amount, 0)

    await prisma.creditCardStatement.update({
      where: { id: statement.id },
      data: {
        totalAmount,
        paidAmount,
        status: getCreditCardStatementStatus({
          closingDate: statement.closingDate,
          dueDate: statement.dueDate,
          totalAmount,
          paidAmount,
        }),
      },
    })
  }
}

async function main() {
  console.log('Seeding database...')

  // Clean up existing demo user
  const existingUser = await prisma.user.findUnique({ where: { email: 'demo@finance.com' } })
  if (existingUser) {
    await prisma.user.delete({ where: { id: existingUser.id } })
    console.log('  Deleted existing demo user')
  }

  // Create demo user
  const password = await bcrypt.hash('demo1234', SALT_ROUNDS)
  const user = await prisma.user.create({
    data: {
      email: 'demo@finance.com',
      name: 'Victor',
      password,
    },
  })
  console.log(`  Created user: ${user.email}`)

  // Create accounts
  const accounts = await Promise.all([
    prisma.account.create({
      data: {
        userId: user.id,
        name: 'Nubank',
        type: 'CHECKING',
        initialBalance: 523000,
        color: '#3b82f6',
        icon: 'nubank',
      },
    }),
    prisma.account.create({
      data: {
        userId: user.id,
        name: 'Itau',
        type: 'CHECKING',
        initialBalance: 1245000,
        color: '#f97316',
        icon: 'itau',
      },
    }),
    prisma.account.create({
      data: {
        userId: user.id,
        name: 'Carteira',
        type: 'WALLET',
        initialBalance: 35000,
        color: '#22c55e',
      },
    }),
    prisma.account.create({
      data: {
        userId: user.id,
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
        userId: user.id,
        name: 'Investimentos',
        type: 'INVESTMENT',
        initialBalance: 2500000,
        color: '#14b8a6',
      },
    }),
  ])
  console.log(`  Created ${accounts.length} accounts`)

  const [nubank, itau, carteira, cartaoNubank, investimentos] = accounts

  // Create categories
  const incomeCategories = await Promise.all([
    prisma.category.create({
      data: { userId: user.id, name: 'Salario', type: 'INCOME', color: '#22c55e' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Freelance', type: 'INCOME', color: '#14b8a6' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Rendimentos', type: 'INCOME', color: '#0ea5e9' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Outros Receitas', type: 'INCOME', color: '#64748b' },
    }),
  ])

  const expenseCategories = await Promise.all([
    prisma.category.create({
      data: { userId: user.id, name: 'Alimentacao', type: 'EXPENSE', color: '#ef4444' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Transporte', type: 'EXPENSE', color: '#f97316' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Moradia', type: 'EXPENSE', color: '#a855f7' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Lazer', type: 'EXPENSE', color: '#ec4899' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Saude', type: 'EXPENSE', color: '#10b981' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Educacao', type: 'EXPENSE', color: '#6366f1' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Assinaturas', type: 'EXPENSE', color: '#8b5cf6' },
    }),
    prisma.category.create({
      data: { userId: user.id, name: 'Outros Despesas', type: 'EXPENSE', color: '#64748b' },
    }),
  ])

  const [salario, freelance, rendimentos] = incomeCategories
  const [alimentacao, transporte, moradia, lazer, saude, educacao, assinaturas] = expenseCategories

  console.log(`  Created ${incomeCategories.length + expenseCategories.length} categories`)

  // Create transactions for last 3 months
  const now = new Date()
  const transactions: {
    userId: string
    accountId: string
    categoryId: string | null
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
    amount: number
    description: string
    date: Date
    transferId?: string
  }[] = []

  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const d = (day: number) => createDemoMonthDate(now, monthOffset, day)

    // Salario
    transactions.push({
      userId: user.id,
      accountId: nubank.id,
      categoryId: salario.id,
      type: 'INCOME',
      amount: 850000,
      description: 'Salario mensal',
      date: d(5),
    })

    // Freelance (esporadico)
    if (monthOffset !== 1) {
      transactions.push({
        userId: user.id,
        accountId: itau.id,
        categoryId: freelance.id,
        type: 'INCOME',
        amount: 150000 + Math.floor(Math.random() * 150000),
        description: 'Projeto freelance',
        date: d(12 + Math.floor(Math.random() * 5)),
      })
    }

    // Rendimentos investimento
    transactions.push({
      userId: user.id,
      accountId: investimentos.id,
      categoryId: rendimentos.id,
      type: 'INCOME',
      amount: 35000 + Math.floor(Math.random() * 15000),
      description: 'Rendimento mensal',
      date: d(1),
    })

    // Aluguel
    transactions.push({
      userId: user.id,
      accountId: itau.id,
      categoryId: moradia.id,
      type: 'EXPENSE',
      amount: 220000,
      description: 'Aluguel apartamento',
      date: d(10),
    })

    // Condominio
    transactions.push({
      userId: user.id,
      accountId: itau.id,
      categoryId: moradia.id,
      type: 'EXPENSE',
      amount: 65000,
      description: 'Condominio',
      date: d(10),
    })

    // Supermercado (2-3x por mes)
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      transactions.push({
        userId: user.id,
        accountId: cartaoNubank.id,
        categoryId: alimentacao.id,
        type: 'EXPENSE',
        amount: 25000 + Math.floor(Math.random() * 35000),
        description: ['Supermercado Extra', 'Supermercado Pao de Acucar', 'Hortifruti'][i % 3],
        date: d(3 + i * 10 + Math.floor(Math.random() * 3)),
      })
    }

    // iFood
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      transactions.push({
        userId: user.id,
        accountId: cartaoNubank.id,
        categoryId: alimentacao.id,
        type: 'EXPENSE',
        amount: 3500 + Math.floor(Math.random() * 4500),
        description: 'iFood',
        date: d(1 + Math.floor(Math.random() * 28)),
      })
    }

    // Transporte
    for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) {
      transactions.push({
        userId: user.id,
        accountId: cartaoNubank.id,
        categoryId: transporte.id,
        type: 'EXPENSE',
        amount: 1500 + Math.floor(Math.random() * 3000),
        description: ['Uber', '99', 'Combustivel'][i % 3],
        date: d(1 + Math.floor(Math.random() * 28)),
      })
    }

    // Netflix + Spotify
    transactions.push({
      userId: user.id,
      accountId: cartaoNubank.id,
      categoryId: assinaturas.id,
      type: 'EXPENSE',
      amount: 5590,
      description: 'Netflix',
      date: d(15),
    })
    transactions.push({
      userId: user.id,
      accountId: cartaoNubank.id,
      categoryId: assinaturas.id,
      type: 'EXPENSE',
      amount: 2190,
      description: 'Spotify',
      date: d(15),
    })

    // Academia
    transactions.push({
      userId: user.id,
      accountId: nubank.id,
      categoryId: saude.id,
      type: 'EXPENSE',
      amount: 12990,
      description: 'Academia SmartFit',
      date: d(5),
    })

    // Lazer
    transactions.push({
      userId: user.id,
      accountId: carteira.id,
      categoryId: lazer.id,
      type: 'EXPENSE',
      amount: 8000 + Math.floor(Math.random() * 12000),
      description: ['Cinema', 'Restaurante', 'Bar'][monthOffset % 3],
      date: d(20 + Math.floor(Math.random() * 5)),
    })

    // Educacao (cursos)
    if (monthOffset === 0) {
      transactions.push({
        userId: user.id,
        accountId: nubank.id,
        categoryId: educacao.id,
        type: 'EXPENSE',
        amount: 29900,
        description: 'Curso Udemy',
        date: d(8),
      })
    }
  }

  transactions.push({
    userId: user.id,
    accountId: cartaoNubank.id,
    categoryId: alimentacao.id,
    type: 'EXPENSE',
    amount: 1890,
    description: 'Cafe da tarde',
    date: new Date(now),
  })

  // Filter out transactions with invalid dates (future dates for past months)
  const validTransactions = transactions.filter((t) => t.date <= now)

  await prisma.transaction.createMany({ data: validTransactions })
  console.log(`  Created ${validTransactions.length} transactions`)

  const creditCardTransactions = await prisma.transaction.findMany({
    where: {
      accountId: cartaoNubank.id,
      type: 'EXPENSE',
      transferId: null,
    },
    orderBy: { date: 'asc' },
  })

  for (const transaction of creditCardTransactions) {
    const cycle = getCreditCardStatementCycle({
      transactionDate: transaction.date,
      closingDay: 10,
      dueDay: 17,
    })

    const statement = await prisma.creditCardStatement.upsert({
      where: {
        accountId_periodStart: {
          accountId: cartaoNubank.id,
          periodStart: cycle.periodStart,
        },
      },
      update: {
        periodEnd: cycle.periodEnd,
        closingDate: cycle.closingDate,
        dueDate: cycle.dueDate,
      },
      create: {
        userId: user.id,
        accountId: cartaoNubank.id,
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        closingDate: cycle.closingDate,
        dueDate: cycle.dueDate,
      },
    })

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { creditCardStatementId: statement.id },
    })
  }

  await refreshCreditCardStatements(cartaoNubank.id)

  const statements = await prisma.creditCardStatement.findMany({
    where: { accountId: cartaoNubank.id, totalAmount: { gt: 0 } },
    orderBy: { dueDate: 'asc' },
  })
  const statementToPay = statements.find((statement) => statement.closingDate < now)

  if (statementToPay) {
    const transferId = crypto.randomUUID()
    const paymentDate = statementToPay.dueDate < now ? statementToPay.dueDate : new Date(now)

    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId: user.id,
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
          userId: user.id,
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
  }

  await refreshCreditCardStatements(cartaoNubank.id)

  // Create recurring rules
  const recurringRules = await Promise.all([
    prisma.recurringRule.create({
      data: {
        userId: user.id,
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
        userId: user.id,
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
        userId: user.id,
        accountId: cartaoNubank.id,
        categoryId: assinaturas.id,
        type: 'EXPENSE',
        amount: 5590,
        description: 'Netflix',
        frequency: 'MONTHLY',
        dayOfMonth: 15,
        startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        isActive: true,
      },
    }),
    prisma.recurringRule.create({
      data: {
        userId: user.id,
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
  console.log(`  Created ${recurringRules.length} recurring rules`)

  // Create demo goals
  await Promise.all([
    prisma.goal.create({
      data: {
        userId: user.id,
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
        userId: user.id,
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
        userId: user.id,
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
  console.log('  Created 3 demo goals')

  const [techWishlist, homeWishlist, officeWishlist] = await Promise.all([
    prisma.wishlistCategory.create({
      data: { userId: user.id, name: 'Tecnologia' },
    }),
    prisma.wishlistCategory.create({
      data: { userId: user.id, name: 'Casa' },
    }),
    prisma.wishlistCategory.create({
      data: { userId: user.id, name: 'Home Office' },
    }),
  ])

  const wishlistPurchaseDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.max(1, now.getDate() - 2),
    12,
    0,
    0,
    0,
  )

  const purchasedWishlistTransaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: nubank.id,
      categoryId: lazer.id,
      type: 'EXPENSE',
      amount: 64990,
      description: 'Headphone Bluetooth',
      notes: 'Compra demo originada da wishlist',
      date: wishlistPurchaseDate,
    },
  })

  await Promise.all([
    prisma.wishlistItem.create({
      data: {
        userId: user.id,
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
        userId: user.id,
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
        userId: user.id,
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
        userId: user.id,
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
  console.log('  Created wishlist demo categories and items')

  // Create dashboard with default widgets
  await prisma.dashboard.create({
    data: {
      userId: user.id,
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
  console.log('  Created dashboard with default widgets')

  console.log('\nSeed complete!')
  console.log('  Login: demo@finance.com / demo1234')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
