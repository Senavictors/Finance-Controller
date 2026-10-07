import type {
  ListTransactionsInput,
  LedgerTxn,
  LedgerUnitOfWork,
  TxnPage,
  UpsertPlannedInput,
} from '@/server/modules/ledger'
import { addDays, calendarDateInZone, fromIso } from '../domain/dates'
import {
  dasDescription,
  dasOccurrenceKey,
  DAS_OCCURRENCE_PREFIX,
  projectDasEvents,
} from '../domain/das'
import {
  incomeOccurrenceKey,
  incomeOccurrencePrefix,
  projectIncomeEvents,
  type IncomeRuleParams,
} from '../domain/income-rule'
import { sumMeiByMonth, type MeiLedgerRow } from '../domain/mei-year'
import type { IncomeDeps, IncomeRuleRecord, MeiProfileRecord } from './ports'

/** Horizonte padrão de materialização (dias a partir de hoje). */
export const DEFAULT_HORIZON_DAYS = 90

/** Categorias de sistema (F1-07), resolvidas por chave estável. */
export const INCOME_CATEGORY_KEY = 'renda-mei'
export const DAS_CATEGORY_KEY = 'das-mei'

export interface MaterializationWindow {
  /** Dia de calendário de hoje no fuso de negócio (meio-dia UTC). */
  today: Date
  /** Último dia do horizonte (inclusivo). */
  until: Date
}

/**
 * Janela `[hoje, until]`. `now` e `until` são parâmetros (relógio injetável); `until` padrão =
 * hoje + 90 dias. Hoje conta: um pagamento previsto para hoje ainda não é passado.
 */
export function resolveWindow(
  deps: Pick<IncomeDeps, 'clock'>,
  input: { now?: Date; until?: Date } = {},
): MaterializationWindow {
  const today = calendarDateInZone(input.now ?? deps.clock())
  const until = input.until ?? addDays(today, DEFAULT_HORIZON_DAYS)
  return { today, until }
}

export function ruleParams(rule: IncomeRuleRecord): IncomeRuleParams {
  return {
    baseCents: rule.baseCents,
    perDayCents: rule.perDayCents,
    weekdays: rule.weekdays,
    payDay: rule.payDay,
    paymentAdjust: rule.paymentAdjust,
    additionalBasis: rule.additionalBasis,
    extraDaysOff: rule.extraDaysOff,
    attendanceOverrides: rule.attendanceOverrides,
    startDate: rule.startDate,
    endDate: rule.endDate,
  }
}

export interface SyncSummary {
  created: number
  updated: number
  unchanged: number
  /** Já confirmados/conciliados: nunca tocados. */
  skipped: number
  /** Previstos futuros que deixaram de existir (regra arquivada, feriado/ajuste mudou...). */
  removed: number
  /** Chaves de idempotência dos previstos que a regra gera na janela. */
  occurrenceKeys: string[]
}

export function emptySummary(): SyncSummary {
  return { created: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0, occurrenceKeys: [] }
}

type ListFn = (input: ListTransactionsInput) => Promise<TxnPage>

/** Percorre todas as páginas de uma listagem. */
export async function listAll(list: ListFn, filter: ListTransactionsInput): Promise<LedgerTxn[]> {
  const items: LedgerTxn[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await list({ ...filter, limit: 1000, cursor })
    items.push(...page.items)
    if (page.nextCursor === null) return items
    cursor = page.nextCursor
  }
}

function hasUserLock(txn: LedgerTxn): boolean {
  return Object.values(txn.userLocked).some(Boolean)
}

/** Previstos (`PLANNED`) futuros (data >= hoje) com o prefixo de chave. */
async function listFuturePlanned(
  uow: LedgerUnitOfWork,
  prefix: string,
  today: Date,
): Promise<LedgerTxn[]> {
  return listAll((input) => uow.listTransactions(input), {
    occurrenceKeyPrefix: prefix,
    status: 'PLANNED',
    from: today,
  })
}

function tally(summary: SyncSummary, action: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'SKIPPED') {
  if (action === 'CREATED') summary.created += 1
  else if (action === 'UPDATED') summary.updated += 1
  else if (action === 'UNCHANGED') summary.unchanged += 1
  else summary.skipped += 1
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

/**
 * Reconcilia os previstos de renda das regras com o ledger, DENTRO de uma unit of work:
 * 1. lê os `PLANNED` futuros existentes (para o horizonte não cortar previstos mais distantes);
 * 2. `upsertPlannedBatch` (primeira escrita do ledger: respeita a ordem de locks);
 * 3. apaga os `PLANNED` futuros que a regra já não gera (e que o usuário não travou).
 * Idempotente: repetir não duplica. Confirmados (`CLEARED|RECONCILED`) nunca são tocados.
 */
export async function syncIncomePlanned(
  uow: LedgerUnitOfWork,
  input: {
    rules: IncomeRuleRecord[]
    categoryId: string | null
    window: MaterializationWindow
  },
): Promise<SyncSummary> {
  const { rules, categoryId, window } = input
  const summary = emptySummary()

  const existingByRule = new Map<string, LedgerTxn[]>()
  let horizon = window.until
  for (const rule of rules) {
    const existing = await listFuturePlanned(uow, incomeOccurrencePrefix(rule.id), window.today)
    existingByRule.set(rule.id, existing)
    for (const txn of existing) horizon = laterOf(horizon, txn.date)
  }

  const inputs: UpsertPlannedInput[] = []
  const expected = new Set<string>()
  for (const rule of rules) {
    if (!rule.isActive) continue
    for (const event of projectIncomeEvents(ruleParams(rule), window.today, horizon)) {
      if (event.total <= 0) continue // o ledger não aceita valor zero
      const occurrenceKey = incomeOccurrenceKey(rule.id, event.dateKey)
      expected.add(occurrenceKey)
      inputs.push({
        accountId: rule.destinationAccountId,
        kind: 'INCOME',
        amount: event.total,
        date: event.paymentDate,
        description: `Renda prevista ${event.scheduleMonth}`,
        ...(categoryId ? { categoryId } : {}),
        source: 'RECURRING',
        occurrenceKey,
      })
    }
  }

  if (inputs.length > 0) {
    const results = await uow.upsertPlannedBatch(inputs)
    for (const result of results) tally(summary, result.action)
  }
  summary.occurrenceKeys = [...expected].sort()

  for (const existing of existingByRule.values()) {
    for (const txn of existing) {
      if (txn.occurrenceKey === null || expected.has(txn.occurrenceKey)) continue
      if (hasUserLock(txn)) continue
      await uow.deleteTransaction(txn.id)
      summary.removed += 1
    }
  }
  return summary
}

/** Mesma reconciliação, para o DAS (`das:AAAA-MM-DD`). Sem conta pagadora ou valor 0: nada gera. */
export async function syncDasPlanned(
  uow: LedgerUnitOfWork,
  input: {
    profile: MeiProfileRecord
    categoryId: string | null
    window: MaterializationWindow
  },
): Promise<SyncSummary> {
  const { profile, categoryId, window } = input
  const summary = emptySummary()

  const existing = await listFuturePlanned(uow, DAS_OCCURRENCE_PREFIX, window.today)
  let horizon = window.until
  for (const txn of existing) horizon = laterOf(horizon, txn.date)

  const inputs: UpsertPlannedInput[] = []
  const expected = new Set<string>()
  if (profile.dasAccountId !== null && profile.dasAmountCents > 0) {
    for (const event of projectDasEvents(profile, window.today, horizon)) {
      const occurrenceKey = dasOccurrenceKey(event.dateKey)
      expected.add(occurrenceKey)
      inputs.push({
        accountId: profile.dasAccountId,
        kind: 'EXPENSE',
        amount: event.amountCents,
        date: event.dueDate,
        description: dasDescription(event.competence),
        ...(categoryId ? { categoryId } : {}),
        source: 'RECURRING',
        occurrenceKey,
      })
    }
  }

  if (inputs.length > 0) {
    const results = await uow.upsertPlannedBatch(inputs)
    for (const result of results) tally(summary, result.action)
  }
  summary.occurrenceKeys = [...expected].sort()

  for (const txn of existing) {
    if (txn.occurrenceKey === null || expected.has(txn.occurrenceKey)) continue
    if (hasUserLock(txn)) continue
    await uow.deleteTransaction(txn.id)
    summary.removed += 1
  }
  return summary
}

/**
 * Lançamentos que contam como faturamento no ano: `INCOME` compensados das contas PJ. O filtro
 * fino (estornos, valor positivo) é do domínio (`sumMeiByMonth`).
 */
export async function loadMeiRows(
  list: ListFn,
  accountIds: readonly string[],
  year: number,
): Promise<MeiLedgerRow[]> {
  const rows: MeiLedgerRow[] = []
  const from = fromIso(`${String(year).padStart(4, '0')}-01-01`)
  const to = fromIso(`${String(year).padStart(4, '0')}-12-31`)
  for (const accountId of accountIds) {
    const txns = await listAll(list, {
      accountId,
      kind: 'INCOME',
      status: ['CLEARED', 'RECONCILED'],
      from,
      to,
    })
    for (const t of txns) {
      rows.push({
        accountId: t.accountId,
        kind: t.kind,
        status: t.status,
        amount: t.amount,
        date: t.date,
        refundOfId: t.refundOfId,
      })
    }
  }
  return rows
}

/** Contas que contam como faturamento: a `businessAccountId` do perfil, senão todas as PJ. */
export async function meiAccountIds(
  deps: Pick<IncomeDeps, 'repo'>,
  userId: string,
  profile: MeiProfileRecord,
): Promise<string[]> {
  if (profile.businessAccountId !== null) return [profile.businessAccountId]
  return deps.repo.listBusinessAccountIds(userId)
}

export async function computeMeiByMonth(
  deps: Pick<IncomeDeps, 'repo'>,
  list: ListFn,
  userId: string,
  profile: MeiProfileRecord,
  year: number,
): Promise<{ byMonth: number[]; accountIds: string[] }> {
  const accountIds = await meiAccountIds(deps, userId, profile)
  const rows = await loadMeiRows(list, accountIds, year)
  return { byMonth: sumMeiByMonth(rows, year, new Set(accountIds)), accountIds }
}

/** `3520,00` com separador de milhar, sem `Intl` (saída estável entre ambientes). */
export function formatBrl(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const reais = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}R$ ${grouped},${rest}`
}
