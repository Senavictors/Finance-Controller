import type { LedgerTxn, LedgerUnitOfWork, TxnStatus } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import { BUSINESS_TIME_ZONE, calendarDayInZone, diffInDays } from '../domain/calendar'
import { desiredCardTxnStatus } from '../domain/card-status'
import {
  getStatementCycle,
  getStatementCycleByKey,
  isCardConfigured,
  type StatementCycle,
} from '../domain/statement-cycle'
import { getStatementStatus, type StatementStatus } from '../domain/statement-status'
import { computeStatementTotals, type StatementTotals } from '../domain/statement-totals'
import type { CardAccountRow, CardsContext, CardsDeps, NewStatement, StatementRow } from './ports'

/** Cartão com ciclo configurado: o que os use-cases precisam para calcular faturas. */
export interface ConfiguredCard extends CardAccountRow {
  creditLimit: number
  closingDay: number
  dueDay: number
}

/** Fatura como os use-cases devolvem (cache do banco + status recalculado para `now`). */
export interface StatementSummary {
  id: string
  accountId: string
  statementKey: string
  periodStart: Date
  periodEnd: Date
  closingDate: Date
  dueDate: Date
  status: StatementStatus
  /** Total líquido (cobranças - créditos); negativo = crédito a favor. */
  total: number
  paid: number
  /** `max(0, total - paid)`. */
  open: number
  /** `max(0, paid - total)`: crédito sobrando. */
  creditBalance: number
  /** Dias de calendário até o vencimento (negativo = vencida). */
  daysToDue: number
}

/** "Hoje" de negócio (dia de calendário em meio-dia UTC) a partir do relógio injetado. */
export function todayOf(deps: Pick<CardsDeps, 'clock' | 'timeZone'>): Date {
  return calendarDayInZone(deps.clock(), deps.timeZone ?? BUSINESS_TIME_ZONE)
}

/** Lê o cartão (dono + tipo) e confere a configuração de ciclo. */
export async function loadCard(
  deps: CardsDeps,
  ctx: CardsContext,
  accountId: string,
  tx?: LedgerUnitOfWork['tx'],
): Promise<ConfiguredCard> {
  const account = await deps.repo.findAccount(ctx.userId, accountId, tx)
  if (!account || account.type !== 'CREDIT_CARD') {
    throw new CardsError('CARD_NOT_FOUND', 'Cartão de crédito não encontrado.', { accountId })
  }
  if (!isCardConfigured(account)) {
    throw new CardsError(
      'CARD_NOT_CONFIGURED',
      'O cartão precisa de limite, dia de fechamento e dia de vencimento configurados.',
      { accountId },
    )
  }
  return account as ConfiguredCard
}

export function cycleFor(card: ConfiguredCard, date: Date): StatementCycle {
  return getStatementCycle({
    purchaseDate: date,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  })
}

export function cycleForKey(card: ConfiguredCard, statementKey: string): StatementCycle {
  return getStatementCycleByKey({
    statementKey,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  })
}

export function draftStatement(
  ctx: CardsContext,
  card: { id: string },
  cycle: StatementCycle,
  id: string,
): NewStatement {
  return {
    id,
    userId: ctx.userId,
    accountId: card.id,
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    closingDate: cycle.closingDate,
    dueDate: cycle.dueDate,
    statementKey: cycle.statementKey,
  }
}

/**
 * Cria as faturas ausentes (idempotente, sem travar), em ordem de `statementKey` (ordem global
 * entre use-cases: duas transações que criam as mesmas chaves nunca se cruzam). Devolve todas
 * as pedidas por `statementKey`.
 */
export async function ensureStatementsInOrder(
  deps: CardsDeps,
  uow: LedgerUnitOfWork,
  ctx: CardsContext,
  drafts: NewStatement[],
): Promise<Map<string, StatementRow>> {
  const byKey = new Map<string, NewStatement>()
  for (const draft of drafts)
    if (!byKey.has(draft.statementKey)) byKey.set(draft.statementKey, draft)
  const sorted = [...byKey.values()].sort((a, b) => (a.statementKey < b.statementKey ? -1 : 1))
  const ensured = await deps.repo.ensureStatements(ctx.userId, sorted, uow.tx)
  return new Map(ensured.map((row) => [row.statementKey, row]))
}

/**
 * Garante as faturas (idempotente) e as trava, nesta ordem: 1) cria as ausentes em ordem de
 * `statementKey`; 2) `SELECT ... FOR UPDATE` ordenado por id. Todo use-case que escreve numa
 * fatura chama isto ANTES de qualquer escrita no ledger (ordem de locks do ledger.md).
 * Devolve as faturas travadas por `statementKey`.
 */
export async function ensureAndLockStatements(
  deps: CardsDeps,
  uow: LedgerUnitOfWork,
  ctx: CardsContext,
  drafts: NewStatement[],
): Promise<Map<string, StatementRow>> {
  const ensured = [...(await ensureStatementsInOrder(deps, uow, ctx, drafts)).values()]
  const locked = await deps.repo.lockStatements(
    ctx.userId,
    ensured.map((row) => row.id),
    uow.tx,
  )
  return new Map(locked.map((row) => [row.statementKey, row]))
}

/** Trava faturas já existentes (ordenado por id). Devolve por id; ids ausentes não voltam. */
export async function lockExistingStatements(
  deps: CardsDeps,
  uow: LedgerUnitOfWork,
  ctx: CardsContext,
  ids: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, StatementRow>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (unique.length === 0) return new Map()
  const locked = await deps.repo.lockStatements(ctx.userId, unique, uow.tx)
  return new Map(locked.map((row) => [row.id, row]))
}

const PAGE = 1000

/** Todos os lançamentos do ledger de um filtro (várias páginas, dentro da unit of work). */
export async function listAllTransactions(
  uow: LedgerUnitOfWork,
  filter: Parameters<LedgerUnitOfWork['listTransactions']>[0] = {},
): Promise<LedgerTxn[]> {
  const items: LedgerTxn[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await uow.listTransactions({ ...filter, cursor, limit: PAGE })
    items.push(...page.items)
    if (!page.nextCursor || page.items.length === 0) break
    cursor = page.nextCursor
  }
  return items
}

export function toSummary(row: StatementRow, now: Date, timeZone?: string): StatementSummary {
  const today = calendarDayInZone(now, timeZone ?? BUSINESS_TIME_ZONE)
  const balance = row.totalAmount - row.paidAmount
  return {
    id: row.id,
    accountId: row.accountId,
    statementKey: row.statementKey,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    closingDate: row.closingDate,
    dueDate: row.dueDate,
    status: getStatementStatus({
      closingDate: row.closingDate,
      dueDate: row.dueDate,
      totalAmount: row.totalAmount,
      paidAmount: row.paidAmount,
      now,
      timeZone,
    }),
    total: row.totalAmount,
    paid: row.paidAmount,
    open: Math.max(0, balance),
    creditBalance: Math.max(0, -balance),
    daysToDue: diffInDays(today, row.dueDate),
  }
}

/** Totais e status "ao vivo" de uma fatura, a partir dos lançamentos do ledger. */
export function liveTotals(
  deps: CardsDeps,
  row: StatementRow,
  txns: readonly LedgerTxn[],
): { totals: StatementTotals; status: StatementStatus } {
  const totals = computeStatementTotals(txns)
  const status = getStatementStatus({
    closingDate: row.closingDate,
    dueDate: row.dueDate,
    totalAmount: totals.net,
    paidAmount: totals.paid,
    now: deps.clock(),
    timeZone: deps.timeZone,
  })
  return { totals, status }
}

/**
 * Fatura efetivamente quitada por pagamentos: houve pagamento e nada sobra em aberto. É o
 * critério dos bloqueios "fatura PAID não recebe nem cede lançamentos" (mover, estornar,
 * antecipar, apagar compra). Uma fatura fechada e vazia (ou só com crédito) tem o RÓTULO
 * `PAID` (nada a pagar), mas não foi paga: continua aceitando lançamentos movidos pelo usuário.
 */
export function isPaidOut(totals: Pick<StatementTotals, 'paid' | 'open'>): boolean {
  return totals.paid > 0 && totals.open === 0
}

/**
 * Recalcula a fatura a partir do ledger (fonte de verdade) e grava o cache (`totalAmount`,
 * `paidAmount`, `status`) se mudou. A fatura deve estar travada pelo chamador.
 */
export async function refreshStatement(
  deps: CardsDeps,
  uow: LedgerUnitOfWork,
  ctx: CardsContext,
  row: StatementRow,
  txns?: readonly LedgerTxn[],
): Promise<{ row: StatementRow; totals: StatementTotals; summary: StatementSummary }> {
  const items = txns ?? (await listAllTransactions(uow, { statementId: row.id }))
  const { totals, status } = liveTotals(deps, row, items)
  let updated = row
  if (row.totalAmount !== totals.net || row.paidAmount !== totals.paid || row.status !== status) {
    updated = await deps.repo.updateStatementTotals(
      ctx.userId,
      row.id,
      { totalAmount: totals.net, paidAmount: totals.paid, status },
      uow.tx,
    )
  }
  return { row: updated, totals, summary: toSummary(updated, deps.clock(), deps.timeZone) }
}

/** Status que um lançamento do cartão deve ter na fatura (convenção do módulo). */
export function statusFor(
  deps: CardsDeps,
  date: Date,
  statement: Pick<StatementRow, 'closingDate'>,
): TxnStatus {
  return desiredCardTxnStatus({
    date,
    statementClosingDate: statement.closingDate,
    today: todayOf(deps),
  })
}

/** Kinds de cartão que pertencem a uma fatura (compra, tarifa, juros, estorno, ajuste). */
export const STATEMENT_ITEM_KINDS = ['EXPENSE', 'FEE', 'INTEREST', 'INCOME', 'ADJUSTMENT'] as const

/** Chave de idempotência do crédito de desconto de uma antecipação. */
export function advanceDiscountKey(advanceId: string): string {
  return `advance:${advanceId}`
}

/** Garante que o lançamento é de uma conta de cartão do usuário. */
export async function assertCardTransaction(
  deps: CardsDeps,
  ctx: CardsContext,
  txn: LedgerTxn,
  tx: LedgerUnitOfWork['tx'],
): Promise<ConfiguredCard> {
  const account = await deps.repo.findAccount(ctx.userId, txn.accountId, tx)
  if (!account || account.type !== 'CREDIT_CARD') {
    throw new CardsError(
      'NOT_A_CARD_TRANSACTION',
      'O lançamento não pertence a uma conta de cartão de crédito.',
      { transactionId: txn.id },
    )
  }
  return loadCard(deps, ctx, txn.accountId, tx)
}
