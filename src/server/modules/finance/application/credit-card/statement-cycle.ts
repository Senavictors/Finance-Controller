export type CreditCardAccountConfig = {
  id: string
  userId: string
  type: string
  creditLimit: number | null
  statementClosingDay: number | null
  statementDueDay: number | null
}

function buildMonthDate(year: number, month: number, day: number, endOfDay = false) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const safeDay = Math.min(day, lastDay)

  return new Date(
    year,
    month,
    safeDay,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function getCreditCardStatementStatus({
  closingDate,
  dueDate,
  totalAmount,
  paidAmount,
}: {
  closingDate: Date
  dueDate: Date
  totalAmount: number
  paidAmount: number
}) {
  const openAmount = Math.max(totalAmount - paidAmount, 0)
  const now = new Date()

  if (totalAmount > 0 && openAmount === 0) return 'PAID' as const
  if (now > dueDate && openAmount > 0) return 'OVERDUE' as const
  if (now > closingDate) return 'CLOSED' as const
  return 'OPEN' as const
}

export function isCreditCardBillingConfigured(account: CreditCardAccountConfig) {
  return (
    account.type === 'CREDIT_CARD' &&
    account.creditLimit != null &&
    account.statementClosingDay != null &&
    account.statementDueDay != null
  )
}

export function getCreditCardStatementCycle({
  transactionDate,
  closingDay,
  dueDay,
}: {
  transactionDate: Date
  closingDay: number
  dueDay: number
}) {
  const txDate = new Date(transactionDate)
  txDate.setHours(12, 0, 0, 0)

  let closingYear = txDate.getFullYear()
  let closingMonth = txDate.getMonth()
  let closingDate = buildMonthDate(closingYear, closingMonth, closingDay, true)

  if (txDate > closingDate) {
    closingMonth += 1
    if (closingMonth > 11) {
      closingMonth = 0
      closingYear += 1
    }
    closingDate = buildMonthDate(closingYear, closingMonth, closingDay, true)
  }

  let previousClosingYear = closingYear
  let previousClosingMonth = closingMonth - 1
  if (previousClosingMonth < 0) {
    previousClosingMonth = 11
    previousClosingYear -= 1
  }

  const previousClosingDate = buildMonthDate(
    previousClosingYear,
    previousClosingMonth,
    closingDay,
    true,
  )
  const periodStart = addDays(previousClosingDate, 1)
  periodStart.setHours(0, 0, 0, 0)

  let dueYear = closingYear
  let dueMonth = closingMonth
  let dueDate = buildMonthDate(dueYear, dueMonth, dueDay, true)

  if (dueDate <= closingDate) {
    dueMonth += 1
    if (dueMonth > 11) {
      dueMonth = 0
      dueYear += 1
    }
    dueDate = buildMonthDate(dueYear, dueMonth, dueDay, true)
  }

  return {
    periodStart,
    periodEnd: closingDate,
    closingDate,
    dueDate,
  }
}
