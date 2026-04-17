import { describe, expect, it } from 'vitest'
import { listProjectedRecurringDates } from './project-recurrences'

const periodStart = new Date(2026, 3, 1)
const periodEnd = new Date(2026, 3, 30, 23, 59, 59, 999)

describe('forecast/project-recurrences', () => {
  it('projeta regra mensal apenas apos a data de referencia', () => {
    const reference = new Date(2026, 3, 10, 12, 0, 0)
    const dates = listProjectedRecurringDates(
      {
        frequency: 'MONTHLY',
        dayOfMonth: 15,
        dayOfWeek: null,
        startDate: new Date(2026, 0, 15),
        endDate: null,
      },
      periodStart,
      periodEnd,
      reference,
    )

    expect(dates).toHaveLength(1)
    expect(dates[0].getDate()).toBe(15)
  })

  it('nao projeta regra mensal quando o dia ja passou no periodo', () => {
    const reference = new Date(2026, 3, 20, 12, 0, 0)
    const dates = listProjectedRecurringDates(
      {
        frequency: 'MONTHLY',
        dayOfMonth: 15,
        dayOfWeek: null,
        startDate: new Date(2026, 0, 15),
        endDate: null,
      },
      periodStart,
      periodEnd,
      reference,
    )

    expect(dates).toHaveLength(0)
  })

  it('respeita endDate da regra', () => {
    const reference = new Date(2026, 3, 1, 0, 0, 0)
    const dates = listProjectedRecurringDates(
      {
        frequency: 'DAILY',
        dayOfMonth: null,
        dayOfWeek: null,
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 3, 5),
      },
      periodStart,
      periodEnd,
      reference,
    )

    expect(dates.length).toBeGreaterThan(0)
    expect(dates[dates.length - 1] <= new Date(2026, 3, 5, 23, 59, 59, 999)).toBe(true)
  })

  it('semanal respeita dia da semana', () => {
    const reference = new Date(2026, 3, 1, 0, 0, 0)
    const dates = listProjectedRecurringDates(
      {
        frequency: 'WEEKLY',
        dayOfMonth: null,
        dayOfWeek: 1,
        startDate: new Date(2026, 0, 5),
        endDate: null,
      },
      periodStart,
      periodEnd,
      reference,
    )

    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((d) => d.getDay() === 1)).toBe(true)
  })
})
