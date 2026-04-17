import type { ResolvedMonthPeriod } from './types'

const MONTH_PARAM_REGEX = /^\d{4}-\d{2}$/

export function isValidMonthParam(monthParam?: string | null): monthParam is string {
  return typeof monthParam === 'string' && MONTH_PARAM_REGEX.test(monthParam)
}

export function resolveMonthPeriod(
  monthParam?: string | null,
  now = new Date(),
): ResolvedMonthPeriod {
  const [year, month] = isValidMonthParam(monthParam)
    ? monthParam.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1]

  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0, 23, 59, 59, 999)
  const prevFrom = new Date(year, month - 2, 1)
  const prevTo = new Date(year, month - 1, 0, 23, 59, 59, 999)

  return {
    year,
    month,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    from,
    to,
    prevFrom,
    prevTo,
  }
}
