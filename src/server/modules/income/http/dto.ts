import { toIso } from '../domain/dates'
import type {
  ConfirmIncomeReceiptResult,
  IncomeProjection,
  MaterializeIncomeResult,
} from '../application/income'
import type { MaterializeDasResult, MeiStatus, UpsertMeiProfileResult } from '../application/mei'
import type { IncomeRuleRecord, MeiProfileRecord } from '../application/ports'

/** DTOs das rotas: datas de calendário como `YYYY-MM-DD`, dinheiro em centavos inteiros. */

export function toRuleDto(rule: IncomeRuleRecord) {
  return {
    id: rule.id,
    name: rule.name,
    baseCents: rule.baseCents,
    perDayCents: rule.perDayCents,
    weekdays: rule.weekdays,
    payDay: rule.payDay,
    paymentAdjust: rule.paymentAdjust,
    additionalBasis: rule.additionalBasis,
    destinationAccountId: rule.destinationAccountId,
    extraDaysOff: rule.extraDaysOff,
    attendanceOverrides: rule.attendanceOverrides,
    startDate: toIso(rule.startDate),
    endDate: rule.endDate ? toIso(rule.endDate) : null,
    isActive: rule.isActive,
  }
}

export function toProjectionDto(projection: IncomeProjection) {
  return {
    from: toIso(projection.from),
    to: toIso(projection.to),
    expectedCents: projection.expectedCents,
    pendingCents: projection.pendingCents,
    events: projection.events.map((e) => ({
      ruleId: e.ruleId,
      ruleName: e.ruleName,
      accountId: e.accountId,
      occurrenceKey: e.occurrenceKey,
      paymentDate: e.dateKey,
      scheduleMonth: e.scheduleMonth,
      competence: { start: toIso(e.competence.start), end: toIso(e.competence.end) },
      baseCents: e.base,
      additionalCents: e.additional,
      presentialDays: e.presentialDays,
      presentialDates: e.dates,
      totalCents: e.total,
      transaction: e.transaction
        ? {
            id: e.transaction.id,
            status: e.transaction.status,
            amountCents: e.transaction.amount,
            date: toIso(e.transaction.date),
          }
        : null,
    })),
  }
}

export function toProfileDto(profile: MeiProfileRecord) {
  return {
    openedAt: profile.openedAt ? toIso(profile.openedAt) : null,
    annualCeilingCents: profile.annualCeilingCents,
    dasAmountCents: profile.dasAmountCents,
    dasDueDay: profile.dasDueDay,
    dasAccountId: profile.dasAccountId,
    businessAccountId: profile.businessAccountId,
  }
}

export function toProfileResultDto(result: UpsertMeiProfileResult) {
  return { profile: toProfileDto(result.profile), warnings: result.warnings, das: result.das }
}

export function toMeiStatusDto(status: MeiStatus) {
  return {
    year: status.year,
    ceilingCents: status.ceiling,
    accumulatedCents: status.accumulated,
    remainingCents: status.remaining,
    pct: status.pct,
    level: status.level,
    message: status.message,
    byMonth: status.byMonth,
    annualCeilingCents: status.annualCeilingCents,
    openedAt: status.openedAt ? toIso(status.openedAt) : null,
    projection: status.projection,
    assumptions: status.assumptions,
  }
}

export function toMaterializeDto(
  income: MaterializeIncomeResult,
  das: MaterializeDasResult | null,
) {
  return {
    income: { ...income, from: toIso(income.from), until: toIso(income.until) },
    das: das ? { ...das, from: toIso(das.from), until: toIso(das.until) } : null,
  }
}

/** `transaction` é montado pela rota com o DTO do ledger. */
export function toConfirmDto(result: ConfirmIncomeReceiptResult) {
  return {
    planned: { amountCents: result.planned.amount, date: toIso(result.planned.date) },
    differenceCents: result.differenceCents,
  }
}
