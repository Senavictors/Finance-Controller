type RecurringRuleInput = {
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  startDate: Date | string
  endDate: Date | string | null
  isActive: boolean
}

export function getNextOccurrence(rule: RecurringRuleInput): Date | null {
  if (!rule.isActive) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const endDate = rule.endDate ? new Date(rule.endDate) : null
  if (endDate && endDate < today) return null

  const ruleStart = new Date(rule.startDate)
  ruleStart.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const from = ruleStart > tomorrow ? ruleStart : tomorrow

  const effectiveEnd = endDate ?? new Date(today.getFullYear() + 2, 0, 1)

  const current = new Date(from)
  let guard = 0

  while (current <= effectiveEnd) {
    if (guard++ > 400) break

    let match = false
    switch (rule.frequency) {
      case 'DAILY':
        match = true
        break
      case 'WEEKLY':
        match = rule.dayOfWeek !== null && current.getDay() === rule.dayOfWeek
        break
      case 'MONTHLY':
        match = rule.dayOfMonth !== null && current.getDate() === rule.dayOfMonth
        break
      case 'YEARLY':
        match =
          rule.dayOfMonth !== null &&
          current.getDate() === rule.dayOfMonth &&
          current.getMonth() === new Date(rule.startDate).getMonth()
        break
    }

    if (match) return new Date(current)
    current.setDate(current.getDate() + 1)
  }

  return null
}

export const freqLabels: Record<string, string> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
}
