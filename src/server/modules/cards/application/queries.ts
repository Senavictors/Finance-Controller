import type { AccountPosition, LedgerTxn } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import { suggestPaymentAccount } from '../domain/payment'
import { addMonthsToKey } from '../domain/calendar'
import { getStatementCycle } from '../domain/statement-cycle'
import type { StatementTotals } from '../domain/statement-totals'
import type { CardsContext, CardsDeps, StatementRow } from './ports'
import {
  listAllTransactions,
  liveTotals,
  loadCard,
  toSummary,
  todayOf,
  type StatementSummary,
} from './shared'
import { syncCardStatuses } from './sync-card-statuses'

export interface ListStatementsOptions {
  /** Padrão `true`: sincroniza status/vínculos do cartão antes de listar (leitura preguiçosa). */
  sync?: boolean
}

/**
 * Faturas do cartão, da mais recente para a mais antiga. Antes de ler, roda `syncCardStatuses`
 * do cartão (idempotente) para promover status por data e vincular lançamentos sem fatura.
 */
export async function listStatements(
  deps: CardsDeps,
  ctx: CardsContext,
  accountId: string,
  options: ListStatementsOptions = {},
): Promise<StatementSummary[]> {
  await loadCard(deps, ctx, accountId)
  if (options.sync !== false) await syncCardStatuses(deps, ctx, { accountId })
  const rows = await deps.repo.listStatements(ctx.userId, accountId)
  const now = deps.clock()
  return rows.map((row) => toSummary(row, now, deps.timeZone))
}

export interface StatementDetail {
  statement: StatementSummary
  /** Componentes dos totais (cobranças, créditos, pago...): o que a UI explica ao usuário. */
  totals: StatementTotals
  /** Lançamentos da fatura (compras, estornos, pagamentos), por data. */
  items: LedgerTxn[]
  card: { id: string; name: string }
  /** Conta sugerida para pagar (maior disponível); `null` sem candidata ou sem valor em aberto. */
  suggestedPaymentAccountId: string | null
}

/**
 * Detalhe da fatura calculado AO VIVO a partir do ledger (fonte de verdade): itens, totais,
 * `open`, `creditBalance`, dias para vencer e conta sugerida para o pagamento.
 */
export async function getStatementDetail(
  deps: CardsDeps,
  ctx: CardsContext,
  statementId: string,
): Promise<StatementDetail> {
  return deps.ledger.runInTransaction(ctx, async (uow) => {
    const row = await deps.repo.findStatement(ctx.userId, statementId, uow.tx)
    if (!row) throw new CardsError('STATEMENT_NOT_FOUND', 'Fatura não encontrada.')
    const card = await deps.repo.findAccount(ctx.userId, row.accountId, uow.tx)
    if (!card) throw new CardsError('CARD_NOT_FOUND', 'Cartão de crédito não encontrado.')

    const items = await listAllTransactions(uow, { statementId: row.id })
    const { totals, status } = liveTotals(deps, row, items)
    const live: StatementRow = { ...row, totalAmount: totals.net, paidAmount: totals.paid, status }

    let suggestedPaymentAccountId: string | null = null
    if (totals.open > 0) {
      const accounts = await deps.repo.listAccounts(ctx.userId, uow.tx)
      const candidates = []
      for (const account of accounts) {
        if (account.type === 'CREDIT_CARD' || account.isArchived) continue
        const position = await uow.getAccountPosition(account.id)
        candidates.push({
          id: account.id,
          type: account.type,
          isArchived: account.isArchived,
          current: position.current,
          overdraftLimit: account.overdraftLimit,
        })
      }
      suggestedPaymentAccountId = suggestPaymentAccount(candidates)?.id ?? null
    }

    return {
      statement: toSummary(live, deps.clock(), deps.timeZone),
      totals,
      items: [...items].sort(
        (a, b) => a.date.getTime() - b.date.getTime() || (a.id < b.id ? -1 : 1),
      ),
      card: { id: card.id, name: card.name },
      suggestedPaymentAccountId,
    }
  })
}

export interface ActivePurchase {
  purchaseId: string
  description: string
  installmentCount: number
  /** Parcelas ainda por vir (data original depois de hoje e não antecipadas). */
  remainingCount: number
  /** Soma das parcelas por vir, centavos. */
  remainingAmount: number
}

export interface CardSummary {
  accountId: string
  name: string
  /** `creditLimit`. */
  limit: number
  /** Limite usado: inclui parcelas futuras (RN-09). */
  used: number
  available: number
  /** Quanto passou do limite (informativo). */
  excess: number
  position: AccountPosition
  /** Fatura em que uma compra de hoje cai, se já existir. */
  currentStatement: StatementSummary | null
  currentStatementKey: string
  nextStatement: StatementSummary | null
  nextStatementKey: string
  /** Faturas fechadas com valor em aberto (a pagar), por vencimento. */
  payable: StatementSummary[]
  activePurchases: ActivePurchase[]
  /** Soma das parcelas por vir de todas as compras ativas. */
  installmentsRemainingAmount: number
}

/** Resumo do cartão para a tela: limite, usado, disponível, fatura atual/próxima e parcelas ativas. */
export async function getCardSummary(
  deps: CardsDeps,
  ctx: CardsContext,
  accountId: string,
): Promise<CardSummary> {
  const card = await loadCard(deps, ctx, accountId)
  const today = todayOf(deps)
  const now = deps.clock()
  const position = await deps.ledger.getAccountPosition(ctx, accountId)
  const statements = await deps.repo.listStatements(ctx.userId, accountId)
  const summaries = statements.map((row) => toSummary(row, now, deps.timeZone))

  const currentKey = getStatementCycle({
    purchaseDate: today,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  }).statementKey
  const nextKey = addMonthsToKey(currentKey, 1)

  const purchases = await deps.repo.listPurchases(ctx.userId, accountId)
  const activePurchases: ActivePurchase[] = []
  for (const purchase of purchases) {
    const remaining = purchase.installments.filter(
      (i) => i.advanceId === null && i.originalDate.getTime() > today.getTime(),
    )
    if (remaining.length === 0) continue
    activePurchases.push({
      purchaseId: purchase.id,
      description: purchase.description,
      installmentCount: purchase.installmentCount,
      remainingCount: remaining.length,
      remainingAmount: remaining.reduce((sum, i) => sum + i.originalAmount, 0),
    })
  }

  return {
    accountId,
    name: card.name,
    limit: position.usage.limit,
    used: position.usage.used,
    available: position.usage.available,
    excess: position.usage.excess,
    position,
    currentStatement: summaries.find((s) => s.statementKey === currentKey) ?? null,
    currentStatementKey: currentKey,
    nextStatement: summaries.find((s) => s.statementKey === nextKey) ?? null,
    nextStatementKey: nextKey,
    payable: summaries
      .filter((s) => (s.status === 'CLOSED' || s.status === 'OVERDUE') && s.open > 0)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
    activePurchases,
    installmentsRemainingAmount: activePurchases.reduce((sum, p) => sum + p.remainingAmount, 0),
  }
}
