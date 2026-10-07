import {
  addCalendarDays,
  businessCalendarDay,
  calendarDate,
  daysInMonth,
  diffCalendarDays,
} from '../domain/calendar'
import { buildDailyBalanceSeries } from '../domain/balance-series'
import { DebtError } from '../domain/errors'
import { estimateOverdraftCostFromSeries, type OverdraftSeriesEstimate } from '../domain/overdraft'
import type { DebtsDeps } from './ports'
import { BALANCE_STATUSES, collectTransactions, loadAccountPosition } from './shared'

export interface EstimateOverdraftCostInput {
  /** `AAAA-MM`. */
  month: string
  now: Date
}

export interface OverdraftCostEstimate extends OverdraftSeriesEstimate {
  accountId: string
  month: string
  monthlyRate: number
  overdraftLimit: number
  /** Primeiro e último dia da série (o mês corrente vai só até hoje). */
  from: Date
  to: Date
  /** É uma estimativa: o banco usa convenção própria. */
  isEstimate: true
  assumptions: string[]
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/**
 * "Quanto o cheque especial me custou neste mês": reconstrói o saldo diário a partir da posição
 * atual do ledger e dos lançamentos (o ledger não guarda saldo na data) e aplica a taxa da dívida
 * `OVERDRAFT` da conta. Somente leitura.
 */
export async function estimateOverdraftCost(
  userId: string,
  accountId: string,
  input: EstimateOverdraftCostInput,
  deps: DebtsDeps,
): Promise<OverdraftCostEstimate> {
  const match = MONTH_PATTERN.exec(input.month)
  if (!match) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Mês inválido; use AAAA-MM.', { field: 'month' })
  }
  const year = Number(match[1])
  const month = Number(match[2])

  const loan = await deps.loans.findLoanByAccount(userId, accountId, 'OVERDRAFT')
  if (!loan) {
    throw new DebtError(
      'DEBT_LOAN_NOT_FOUND',
      'Cadastre o cheque especial desta conta para estimar o custo.',
    )
  }
  const position = await loadAccountPosition(deps, userId, accountId)
  const today = businessCalendarDay(input.now)
  const monthStart = calendarDate(year, month, 1)
  const monthEnd = calendarDate(year, month, daysInMonth(year, month))
  const lastDay = diffCalendarDays(monthEnd, today) < 0 ? today : monthEnd

  // Lançamentos que compõem o saldo atual e acontecem depois do 1º dia do mês.
  const transactions =
    diffCalendarDays(monthStart, lastDay) < 0
      ? []
      : await collectTransactions(deps, userId, {
          accountId,
          from: addCalendarDays(monthStart, 1),
          status: [...BALANCE_STATUSES],
        })

  const dailyBalances = buildDailyBalanceSeries({
    currentBalance: position.current,
    asOf: today,
    from: monthStart,
    to: monthEnd,
    transactions: transactions.map((txn) => ({ date: txn.date, amount: txn.amount })),
  })
  const estimate = estimateOverdraftCostFromSeries({
    dailyBalances,
    overdraftLimit: position.usage.limit,
    monthlyRate: loan.monthlyRate,
  })
  return {
    ...estimate,
    accountId,
    month: input.month,
    monthlyRate: loan.monthlyRate,
    overdraftLimit: position.usage.limit,
    from: monthStart,
    to: dailyBalances.length > 0 ? dailyBalances[dailyBalances.length - 1].date : monthStart,
    isEstimate: true,
    assumptions: [
      'Saldo do fim de cada dia reconstruído a partir da posição atual e dos lançamentos da conta.',
      'Juros simples diários: uso diário (dentro do limite) x taxa mensal / 30.',
      'Estimativa: o banco pode usar outra convenção (dias corridos, base 360/365, IOF diário).',
      'O que exceder o limite não entra na estimativa; é reportado à parte.',
    ],
  }
}
