import { prisma } from '@/server/db'
import {
  getCreditCardStatementCycle,
  getCreditCardStatementStatus,
  isCreditCardBillingConfigured,
  type CreditCardAccountConfig,
} from './statement-cycle'

export async function upsertCreditCardStatementForDate(
  account: CreditCardAccountConfig,
  date: Date,
) {
  if (!isCreditCardBillingConfigured(account)) return null

  const cycle = getCreditCardStatementCycle({
    transactionDate: date,
    closingDay: account.statementClosingDay!,
    dueDay: account.statementDueDay!,
  })

  return prisma.creditCardStatement.upsert({
    where: {
      accountId_periodStart: {
        accountId: account.id,
        periodStart: cycle.periodStart,
      },
    },
    update: {
      periodEnd: cycle.periodEnd,
      closingDate: cycle.closingDate,
      dueDate: cycle.dueDate,
    },
    create: {
      userId: account.userId,
      accountId: account.id,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      closingDate: cycle.closingDate,
      dueDate: cycle.dueDate,
    },
  })
}

export async function refreshCreditCardStatement(statementId: string) {
  const statement = await prisma.creditCardStatement.findUnique({
    where: { id: statementId },
    include: {
      transactions: {
        select: { type: true, amount: true },
      },
    },
  })

  if (!statement) return null

  const totalAmount = statement.transactions
    .filter((transaction) => transaction.type === 'EXPENSE')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const paidAmount = statement.transactions
    .filter((transaction) => transaction.type === 'TRANSFER')
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  return prisma.creditCardStatement.update({
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

export async function syncCreditCardTransactionStatement(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      account: {
        select: {
          id: true,
          userId: true,
          type: true,
          creditLimit: true,
          statementClosingDay: true,
          statementDueDay: true,
        },
      },
    },
  })

  if (!transaction) return null

  const previousStatementId = transaction.creditCardStatementId

  if (
    !isCreditCardBillingConfigured(transaction.account) ||
    transaction.type !== 'EXPENSE' ||
    transaction.transferId
  ) {
    if (previousStatementId) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { creditCardStatementId: null },
      })
      await refreshCreditCardStatement(previousStatementId)
    }
    return null
  }

  const statement = await upsertCreditCardStatementForDate(transaction.account, transaction.date)
  if (!statement) return null

  if (transaction.creditCardStatementId !== statement.id) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { creditCardStatementId: statement.id },
    })
  }

  if (previousStatementId && previousStatementId !== statement.id) {
    await refreshCreditCardStatement(previousStatementId)
  }

  await refreshCreditCardStatement(statement.id)

  return statement
}

export async function syncCreditCardStatementsForAccount(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      userId: true,
      type: true,
      creditLimit: true,
      statementClosingDay: true,
      statementDueDay: true,
    },
  })

  if (!account || !isCreditCardBillingConfigured(account)) return []

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      type: 'EXPENSE',
      transferId: null,
    },
    select: { id: true },
    orderBy: { date: 'asc' },
  })

  const statements = await Promise.all(
    transactions.map((transaction) => syncCreditCardTransactionStatement(transaction.id)),
  )

  return statements.filter(
    (statement): statement is NonNullable<typeof statement> => statement != null,
  )
}
