import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { syncCreditCardTransactionStatement } from '@/server/modules/finance/application/credit-card/billing'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

function getNextDates(rule: {
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  startDate: Date
  endDate: Date | null
  lastApplied: Date | null
}): Date[] {
  const dates: Date[] = []
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const from = rule.lastApplied
    ? new Date(rule.lastApplied.getTime() + 86400000)
    : new Date(rule.startDate)
  from.setHours(0, 0, 0, 0)

  const end = rule.endDate && rule.endDate < today ? rule.endDate : today

  const current = new Date(from)

  while (current <= end) {
    let shouldAdd = false

    switch (rule.frequency) {
      case 'DAILY':
        shouldAdd = true
        break
      case 'WEEKLY':
        shouldAdd = current.getDay() === rule.dayOfWeek
        break
      case 'MONTHLY':
        shouldAdd = current.getDate() === rule.dayOfMonth
        break
      case 'YEARLY':
        shouldAdd =
          current.getDate() === rule.dayOfMonth && current.getMonth() === rule.startDate.getMonth()
        break
    }

    if (shouldAdd) {
      dates.push(new Date(current))
    }

    current.setDate(current.getDate() + 1)

    if (dates.length > 365) break
  }

  return dates
}

export async function POST() {
  try {
    const { userId } = await requireAuth()

    const rules = await prisma.recurringRule.findMany({
      where: { userId, isActive: true },
    })

    let created = 0
    let errors = 0
    const affectedTransactionDates: Date[] = []
    const affectedAccountIds: string[] = []
    const affectedCategoryIds: string[] = []
    const affectedStatementIds: string[] = []
    const recurringRuleDates: Date[] = []

    for (const rule of rules) {
      const pendingDates = getNextDates(rule)

      for (const date of pendingDates) {
        const dateStr = date.toISOString().split('T')[0]

        const existingLog = await prisma.recurringLog.findFirst({
          where: {
            recurringRuleId: rule.id,
            appliedDate: {
              gte: new Date(`${dateStr}T00:00:00.000Z`),
              lte: new Date(`${dateStr}T23:59:59.999Z`),
            },
            status: 'success',
          },
        })

        if (existingLog) continue

        try {
          const transaction = await prisma.transaction.create({
            data: {
              userId: rule.userId,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              type: rule.type,
              amount: rule.amount,
              description: rule.description,
              notes: rule.notes,
              date,
            },
          })

          const statement = await syncCreditCardTransactionStatement(transaction.id)

          affectedTransactionDates.push(transaction.date)
          affectedAccountIds.push(transaction.accountId)
          if (transaction.categoryId) {
            affectedCategoryIds.push(transaction.categoryId)
          }
          if (statement?.id) {
            affectedStatementIds.push(statement.id)
          }

          await prisma.recurringLog.create({
            data: {
              recurringRuleId: rule.id,
              transactionId: transaction.id,
              appliedDate: date,
              status: 'success',
            },
          })

          created++
        } catch (err) {
          await prisma.recurringLog.create({
            data: {
              recurringRuleId: rule.id,
              appliedDate: date,
              status: 'error',
              error: err instanceof Error ? err.message : 'Unknown error',
            },
          })
          errors++
        }
      }

      if (pendingDates.length > 0) {
        await prisma.recurringRule.update({
          where: { id: rule.id },
          data: { lastApplied: pendingDates[pendingDates.length - 1] },
        })

        recurringRuleDates.push(rule.startDate)
        if (rule.endDate) {
          recurringRuleDates.push(rule.endDate)
        }
        recurringRuleDates.push(pendingDates[pendingDates.length - 1])
        affectedAccountIds.push(rule.accountId)
        if (rule.categoryId) {
          affectedCategoryIds.push(rule.categoryId)
        }
      }
    }

    if (created > 0) {
      await invalidateAnalyticsSnapshots({
        userId,
        modules: ANALYTICS_MUTATION_MODULES.transaction,
        dates: affectedTransactionDates,
        accountIds: affectedAccountIds,
        categoryIds: affectedCategoryIds,
        statementIds: affectedStatementIds,
      })
    }

    if (recurringRuleDates.length > 0) {
      await invalidateAnalyticsSnapshots({
        userId,
        modules: ANALYTICS_MUTATION_MODULES.recurringRule,
        dates: recurringRuleDates,
        accountIds: affectedAccountIds,
        categoryIds: affectedCategoryIds,
      })
    }

    return NextResponse.json({
      data: { created, errors, rulesProcessed: rules.length },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
