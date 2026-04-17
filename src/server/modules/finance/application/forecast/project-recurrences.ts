type RecurringRuleShape = {
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  startDate: Date
  endDate: Date | null
}

export function listProjectedRecurringDates(
  rule: RecurringRuleShape,
  periodStart: Date,
  periodEnd: Date,
  referenceDate: Date,
): Date[] {
  const dates: Date[] = []

  const ruleStart = new Date(rule.startDate)
  ruleStart.setHours(0, 0, 0, 0)

  const from = new Date(Math.max(referenceDate.getTime() + 1, ruleStart.getTime(), periodStart.getTime()))
  from.setHours(0, 0, 0, 0)
  if (from.getTime() <= referenceDate.getTime()) {
    from.setDate(from.getDate() + 1)
  }

  const effectiveEnd = rule.endDate && rule.endDate < periodEnd ? rule.endDate : periodEnd
  const end = new Date(effectiveEnd)
  end.setHours(23, 59, 59, 999)

  const current = new Date(from)
  let guard = 0

  while (current <= end) {
    if (guard++ > 400) break

    let shouldAdd = false
    switch (rule.frequency) {
      case 'DAILY':
        shouldAdd = true
        break
      case 'WEEKLY':
        shouldAdd = rule.dayOfWeek !== null && current.getDay() === rule.dayOfWeek
        break
      case 'MONTHLY':
        shouldAdd = rule.dayOfMonth !== null && current.getDate() === rule.dayOfMonth
        break
      case 'YEARLY':
        shouldAdd =
          rule.dayOfMonth !== null &&
          current.getDate() === rule.dayOfMonth &&
          current.getMonth() === rule.startDate.getMonth()
        break
    }

    if (shouldAdd) dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}
