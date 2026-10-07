import type { LedgerTxn, TxnStatus } from '@/server/modules/ledger'
import { toIso } from '../domain/dates'
import { IncomeError } from '../domain/errors'
import {
  incomeOccurrenceKey,
  incomeOccurrencePrefix,
  projectIncomeEvents,
  type IncomeEvent,
} from '../domain/income-rule'
import { assertCalendarDate } from '../domain/validation'
import type { IncomeContext, IncomeDeps, IncomeWarning } from './ports'
import {
  INCOME_CATEGORY_KEY,
  formatBrl,
  listAll,
  resolveWindow,
  ruleParams,
  syncIncomePlanned,
  type SyncSummary,
} from './shared'
import { recomputeMeiLedgerInTransaction } from './mei'

/** Evento de renda previsto com o lançamento do ledger (se já materializado). Contrato da F3-02/F3-05. */
export interface IncomeProjectionEvent extends IncomeEvent {
  ruleId: string
  ruleName: string
  accountId: string
  occurrenceKey: string
  /** Lançamento `INCOME` materializado para este pagamento, ou `null` (ainda não materializado). */
  transaction: {
    id: string
    status: TxnStatus
    /** Centavos (do ledger). */
    amount: number
    date: Date
  } | null
}

export interface IncomeProjection {
  from: Date
  to: Date
  events: IncomeProjectionEvent[]
  /** Soma do `total` previsto de todos os eventos. */
  expectedCents: number
  /**
   * Parte ainda NÃO recebida: eventos sem lançamento ou com lançamento `PLANNED|PENDING`
   * (usa o valor real do lançamento quando existe, senão o previsto). Insumo do Disponível.
   */
  pendingCents: number
}

const OPEN_STATUSES: readonly TxnStatus[] = ['PLANNED', 'PENDING']

/**
 * Renda prevista das regras ativas em `[from, to]` (datas de pagamento), com os componentes
 * (base, adicional, dias presenciais) e o vínculo com o lançamento já materializado.
 * Somente leitura; não cria nada. `from`/`to` são meio-dia UTC.
 */
export async function projectIncome(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: { from: Date; to: Date },
): Promise<IncomeProjection> {
  assertCalendarDate(input.from, 'from')
  assertCalendarDate(input.to, 'to')
  if (input.from.getTime() > input.to.getTime()) {
    throw new IncomeError('INCOME_INVALID_PERIOD', 'from é posterior a to.')
  }
  const rules = await deps.repo.listRules(ctx.userId, { activeOnly: true })
  const events: IncomeProjectionEvent[] = []
  for (const rule of rules) {
    const txns = await listAll((i) => deps.ledger.listTransactions(ctx, i), {
      occurrenceKeyPrefix: incomeOccurrencePrefix(rule.id),
    })
    const byKey = new Map(txns.map((t) => [t.occurrenceKey, t]))
    for (const event of projectIncomeEvents(ruleParams(rule), input.from, input.to)) {
      const occurrenceKey = incomeOccurrenceKey(rule.id, event.dateKey)
      const txn = byKey.get(occurrenceKey)
      events.push({
        ...event,
        ruleId: rule.id,
        ruleName: rule.name,
        accountId: rule.destinationAccountId,
        occurrenceKey,
        transaction: txn
          ? { id: txn.id, status: txn.status, amount: txn.amount, date: txn.date }
          : null,
      })
    }
  }
  events.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
  let expectedCents = 0
  let pendingCents = 0
  for (const event of events) {
    expectedCents += event.total
    if (event.transaction === null) pendingCents += event.total
    else if (OPEN_STATUSES.includes(event.transaction.status)) {
      pendingCents += event.transaction.amount
    }
  }
  return { from: input.from, to: input.to, events, expectedCents, pendingCents }
}

export interface MaterializeIncomeResult extends SyncSummary {
  from: Date
  until: Date
  rules: number
  warnings: IncomeWarning[]
}

/**
 * Materializa os previstos de renda das regras ativas de hoje até `until` (padrão: hoje + 90
 * dias) como lançamentos `INCOME` `PLANNED` idempotentes pelo ledger (`occurrenceKey =
 * income:{ruleId}:{AAAA-MM-DD}`). Chamar de novo não duplica; muda o valor/data do previsto
 * ainda `PLANNED`; nunca toca confirmados. É o ponto onde o job diário será plugado.
 */
export async function materializeIncome(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: { now?: Date; until?: Date } = {},
): Promise<MaterializeIncomeResult> {
  const window = resolveWindow(deps, input)
  const warnings: IncomeWarning[] = []
  const categoryId = await deps.repo.resolveCategoryId(ctx.userId, INCOME_CATEGORY_KEY)
  if (categoryId === null) {
    warnings.push({
      code: 'CATEGORY_NOT_FOUND',
      message: `Categoria "${INCOME_CATEGORY_KEY}" não encontrada: os previstos ficam sem categoria.`,
    })
  }
  const { summary, rules } = await deps.ledger.runInTransaction(ctx, async (uow) => {
    const locked = await deps.repo.lockRules(ctx.userId, { activeOnly: true }, uow.tx)
    const sync = await syncIncomePlanned(uow, { rules: locked, categoryId, window })
    return { summary: sync, rules: locked.length }
  })
  return { ...summary, from: window.today, until: window.until, rules, warnings }
}

export interface ConfirmIncomeReceiptInput {
  transactionId: string
  /** Centavos recebidos (> 0); omitido = o previsto. */
  receivedAmount?: number
  /** Meio-dia UTC; omitido = a data prevista. */
  receivedDate?: Date
}

export interface ConfirmIncomeReceiptResult {
  transaction: LedgerTxn
  /** Previsto original (valor e data) antes da confirmação. */
  planned: { amount: number; date: Date }
  /** Recebido menos previsto, em centavos (0 se igual). */
  differenceCents: number
}

/**
 * Confirma o recebimento de um previsto de renda: o ledger muda o lançamento para `CLEARED`
 * com o valor/data reais (`balancePlanned -previsto`, `balanceCleared +real`) e o `MeiLedger`
 * dos anos afetados é recalculado, tudo na mesma transação. Se valor ou data diferem do
 * previsto, o previsto fica registrado em `notes`.
 */
export async function confirmIncomeReceipt(
  deps: IncomeDeps,
  ctx: IncomeContext,
  input: ConfirmIncomeReceiptInput,
): Promise<ConfirmIncomeReceiptResult> {
  if (input.receivedAmount !== undefined) {
    if (!Number.isInteger(input.receivedAmount) || input.receivedAmount <= 0) {
      throw new IncomeError(
        'INCOME_INVALID_INPUT',
        'receivedAmount deve ser um inteiro positivo.',
        {
          field: 'receivedAmount',
        },
      )
    }
  }
  if (input.receivedDate !== undefined) assertCalendarDate(input.receivedDate, 'receivedDate')
  const now = deps.clock()

  return deps.ledger.runInTransaction(ctx, async (uow) => {
    // Perfil primeiro (linha do módulo), depois o ledger: serializa o recálculo do MeiLedger.
    await deps.repo.lockProfile(ctx.userId, uow.tx)
    const current = await uow.findTransaction(input.transactionId)
    if (
      !current ||
      current.kind !== 'INCOME' ||
      current.occurrenceKey === null ||
      !current.occurrenceKey.startsWith('income:')
    ) {
      throw new IncomeError(
        'INCOME_NOT_PLANNED_INCOME',
        'O lançamento informado não é um previsto de renda.',
      )
    }
    if (current.status !== 'PLANNED' && current.status !== 'PENDING') {
      throw new IncomeError(
        'INCOME_NOT_PLANNED_INCOME',
        'Este previsto de renda já foi confirmado.',
      )
    }

    const amount = input.receivedAmount ?? current.amount
    const date = input.receivedDate ?? current.date
    const differs = amount !== current.amount || date.getTime() !== current.date.getTime()
    const patch: Parameters<typeof uow.updateTransaction>[1] = {
      amount,
      date,
      status: 'CLEARED',
    }
    if (differs) {
      const note = `Previsto: ${formatBrl(current.amount)} em ${toIso(current.date)}`
      patch.notes = current.notes ? `${current.notes}\n${note}` : note
    }
    const updated = await uow.updateTransaction(input.transactionId, patch)

    const years = new Set([date.getUTCFullYear(), current.date.getUTCFullYear()])
    for (const year of years) {
      await recomputeMeiLedgerInTransaction(deps, uow, ctx, year, now)
    }
    return {
      transaction: updated.transaction,
      planned: { amount: current.amount, date: current.date },
      differenceCents: amount - current.amount,
    }
  })
}
