import type { LedgerTxn } from '@/server/modules/ledger'
import { desiredCardTxnStatus, desiredPaymentStatus } from '../domain/card-status'
import { computeStatementTotals } from '../domain/statement-totals'
import { getStatementStatus } from '../domain/statement-status'
import type { CardsContext, CardsDeps, StatementRow } from './ports'
import {
  cycleFor,
  draftStatement,
  ensureStatementsInOrder,
  listAllTransactions,
  loadCard,
  toSummary,
  todayOf,
  type ConfiguredCard,
  type StatementSummary,
} from './shared'

export interface SyncCardStatusesInput {
  /** Só este cartão; omitido = todos os cartões ativos e configurados do usuário. */
  accountId?: string
}

export interface CardSyncReport {
  accountId: string
  /** Lançamentos sem fatura que ganharam fatura do ciclo da própria data. */
  linked: number
  promotedToPending: number
  promotedToCleared: number
  /** Faturas cujo total/pago/status mudou. */
  statementsUpdated: number
  statements: StatementSummary[]
}

export interface SyncCardStatusesResult {
  /** Dia de calendário (fuso de negócio) usado como "hoje". */
  today: Date
  cards: CardSyncReport[]
}

/** Kinds que o sync vincula sozinho. ADJUSTMENT (ex.: saldo inicial do cartão) só entra numa fatura por ação explícita. */
const LINKABLE_KINDS: readonly string[] = ['EXPENSE', 'FEE', 'INTEREST', 'INCOME']

/**
 * Sincroniza faturas e status dos cartões por data (idempotente; chamável por job ou por leitura):
 * 1. **Vincula** lançamentos de cartão sem fatura (ex.: criados pelo lançamento rápido ou
 *    importados) à fatura do ciclo da própria data, criando a fatura se faltar. Usa
 *    `setTransactionLinks(..., { actor: 'SYSTEM' })`: `userLocked.statement` (lançamento movido
 *    pelo usuário) vence. Lançamentos que já têm fatura não são reatribuídos (faturas passadas
 *    ficam intactas quando o dia de fechamento muda).
 * 2. **Promove** status: `PLANNED -> PENDING` quando `date <= hoje`, `PENDING -> CLEARED`
 *    quando a fatura fecha (e `PLANNED -> CLEARED` se já nasceu em fatura fechada); pagamentos de
 *    fatura `PLANNED` viram `CLEARED` quando a data chega. Nunca rebaixa nem toca em `RECONCILED`.
 * 3. **Recalcula** em lote `totalAmount`/`paidAmount`/`status` das faturas do cartão a partir do
 *    ledger (uma passada por cartão, sem N+1).
 *
 * Concorrência: a criação das faturas ausentes roda numa transação própria e curta (sem locks
 * de fatura); a transação principal trava todas as faturas do cartão ANTES de reler e escrever.
 */
export async function syncCardStatuses(
  deps: CardsDeps,
  ctx: CardsContext,
  input: SyncCardStatusesInput = {},
): Promise<SyncCardStatusesResult> {
  const today = todayOf(deps)
  const accounts = input.accountId
    ? [await loadCard(deps, ctx, input.accountId)]
    : (await deps.repo.listActiveCards(ctx.userId)).filter(
        (account): account is ConfiguredCard =>
          account.creditLimit != null && account.closingDay != null && account.dueDay != null,
      )

  const cards: CardSyncReport[] = []
  for (const card of accounts) cards.push(await syncCard(deps, ctx, card, today))
  return { today, cards }
}

async function syncCard(
  deps: CardsDeps,
  ctx: CardsContext,
  card: ConfiguredCard,
  today: Date,
): Promise<CardSyncReport> {
  // Fase 1: cria (e confirma) as faturas dos lançamentos sem fatura.
  await deps.ledger.runInTransaction(ctx, async (uow) => {
    const txns = await listAllTransactions(uow, { accountId: card.id })
    const drafts = txns
      .filter((txn) => needsLinking(txn))
      .map((txn) => draftStatement(ctx, card, cycleFor(card, txn.date), deps.uuid()))
    if (drafts.length > 0) await ensureStatementsInOrder(deps, uow, ctx, drafts)
  })

  // Fase 2: trava todas as faturas do cartão (ordem por id), relê e aplica.
  return deps.ledger.runInTransaction(ctx, async (uow) => {
    const existing = await deps.repo.listStatements(ctx.userId, card.id, uow.tx)
    const locked = await deps.repo.lockStatements(
      ctx.userId,
      existing.map((row) => row.id),
      uow.tx,
    )
    const byId = new Map<string, StatementRow>(locked.map((row) => [row.id, row]))
    const byKey = new Map<string, StatementRow>(locked.map((row) => [row.statementKey, row]))

    const txns = await listAllTransactions(uow, { accountId: card.id })
    let linked = 0
    let promotedToPending = 0
    let promotedToCleared = 0

    // vínculo
    const view = new Map<string, LedgerTxn>()
    for (const txn of txns) {
      let current = txn
      if (needsLinking(txn)) {
        const statement = byKey.get(cycleFor(card, txn.date).statementKey)
        if (statement) {
          const result = await uow.setTransactionLinks(
            txn.id,
            { statementId: statement.id, statementKey: statement.statementKey },
            { actor: 'SYSTEM' },
          )
          if (result.statementId === statement.id) {
            linked += 1
            current = { ...txn, statementId: statement.id, statementKey: statement.statementKey }
          }
        }
      }
      view.set(txn.id, current)
    }

    // status
    for (const txn of view.values()) {
      if (txn.status === 'RECONCILED' || txn.status === 'CLEARED') continue
      const statement = txn.statementId ? byId.get(txn.statementId) : undefined
      let desired: 'PLANNED' | 'PENDING' | 'CLEARED'
      if (txn.kind === 'CARD_PAYMENT') {
        if (txn.amount <= 0) continue // a perna da origem muda junto com a do cartão
        desired = desiredPaymentStatus({ date: txn.date, today })
      } else if (statement) {
        desired = desiredCardTxnStatus({
          date: txn.date,
          statementClosingDate: statement.closingDate,
          today,
        })
      } else {
        continue
      }
      if (txn.status === 'PLANNED' && desired !== 'PLANNED') {
        await uow.changeTransactionStatus(txn.id, desired)
        view.set(txn.id, { ...txn, status: desired })
        if (desired === 'PENDING') promotedToPending += 1
        else promotedToCleared += 1
      } else if (txn.status === 'PENDING' && desired === 'CLEARED') {
        await uow.changeTransactionStatus(txn.id, 'CLEARED')
        view.set(txn.id, { ...txn, status: 'CLEARED' })
        promotedToCleared += 1
      }
    }

    // totais em lote (uma passada)
    const grouped = new Map<string, LedgerTxn[]>()
    for (const txn of view.values()) {
      if (!txn.statementId) continue
      const list = grouped.get(txn.statementId) ?? []
      list.push(txn)
      grouped.set(txn.statementId, list)
    }
    const now = deps.clock()
    let statementsUpdated = 0
    const statements: StatementSummary[] = []
    for (const row of [...locked].sort((a, b) => (a.statementKey < b.statementKey ? -1 : 1))) {
      const totals = computeStatementTotals(grouped.get(row.id) ?? [])
      const status = getStatementStatus({
        closingDate: row.closingDate,
        dueDate: row.dueDate,
        totalAmount: totals.net,
        paidAmount: totals.paid,
        now,
        timeZone: deps.timeZone,
      })
      let updated = row
      if (
        row.totalAmount !== totals.net ||
        row.paidAmount !== totals.paid ||
        row.status !== status
      ) {
        updated = await deps.repo.updateStatementTotals(
          ctx.userId,
          row.id,
          { totalAmount: totals.net, paidAmount: totals.paid, status },
          uow.tx,
        )
        statementsUpdated += 1
      }
      statements.push(toSummary(updated, now, deps.timeZone))
    }

    return {
      accountId: card.id,
      linked,
      promotedToPending,
      promotedToCleared,
      statementsUpdated,
      statements,
    }
  })
}

function needsLinking(txn: LedgerTxn): boolean {
  return txn.statementId === null && LINKABLE_KINDS.includes(txn.kind)
}
