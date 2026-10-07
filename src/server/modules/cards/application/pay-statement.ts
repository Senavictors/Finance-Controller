import type { AccountPosition, LedgerWarning } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import { desiredPaymentStatus } from '../domain/card-status'
import {
  assertPaymentAmount,
  assertPaymentSource,
  overdraftWarning,
  type OverdraftWarning,
} from '../domain/payment'
import type { CardsContext, CardsDeps } from './ports'
import {
  listAllTransactions,
  liveTotals,
  refreshStatement,
  todayOf,
  type StatementSummary,
} from './shared'

export interface PayStatementInput {
  statementId: string
  /** Conta de origem (corrente/carteira/poupança...), nunca um cartão. */
  sourceAccountId: string
  /** Centavos em módulo (> 0), até o valor em aberto. */
  amount: number
  /** Data do pagamento (meio-dia UTC). Futura => `PLANNED`. */
  date: Date
  description?: string
}

export interface PayStatementResult {
  transferId: string
  /** Perna negativa na origem. */
  sourceTransactionId: string
  /** Perna positiva no cartão, ligada à fatura. */
  cardTransactionId: string
  statement: StatementSummary
  /** Aviso de cheque especial da origem: informa, não bloqueia (RN-07). */
  overdraftWarning: OverdraftWarning
  positions: AccountPosition[]
  warnings: LedgerWarning[]
}

/**
 * Pagamento de fatura (total ou parcial) como par `CARD_PAYMENT` ligado (ADR-004): `-amount` na
 * origem e `+amount` no cartão com `statementId`/`statementKey`. Fica fora de orçamento e de
 * receita/despesa (o gasto já foi contado na compra). Trava a fatura (`FOR UPDATE`) e confere o
 * aberto **dentro do lock**, a partir do ledger: dois pagamentos simultâneos da mesma fatura
 * nunca passam do aberto (o segundo recebe `STATEMENT_OVERPAYMENT`/`STATEMENT_ALREADY_PAID`).
 */
export async function payStatement(
  deps: CardsDeps,
  ctx: CardsContext,
  input: PayStatementInput,
): Promise<PayStatementResult> {
  return deps.ledger.runInTransaction(ctx, async (uow) => {
    // 1) fatura primeiro (ordem de locks): trava e lê o estado commitado
    const found = await deps.repo.findStatement(ctx.userId, input.statementId, uow.tx)
    if (!found) throw new CardsError('STATEMENT_NOT_FOUND', 'Fatura não encontrada.')
    const [statement] = await deps.repo.lockStatements(ctx.userId, [found.id], uow.tx)
    if (!statement) throw new CardsError('STATEMENT_NOT_FOUND', 'Fatura não encontrada.')

    const source = await deps.repo.findAccount(ctx.userId, input.sourceAccountId, uow.tx)
    if (!source) {
      throw new CardsError('ACCOUNT_NOT_FOUND', 'Conta de origem não encontrada.', {
        accountId: input.sourceAccountId,
      })
    }
    assertPaymentSource({ source, cardAccountId: statement.accountId })

    // 2) aberto "ao vivo" (ledger), já dentro do lock
    const items = await listAllTransactions(uow, { statementId: statement.id })
    const { totals } = liveTotals(deps, statement, items)
    assertPaymentAmount({ amount: input.amount, open: totals.open })

    // 3) aviso de cheque especial (saldo atual antes do pagamento)
    const before = await uow.getAccountPosition(source.id)
    const warning = overdraftWarning(
      { current: before.current, overdraftLimit: source.overdraftLimit },
      input.amount,
    )

    // 4) o par no ledger, com o vínculo só na perna do cartão
    const transfer = await uow.createTransfer({
      kind: 'CARD_PAYMENT',
      sourceAccountId: source.id,
      destinationAccountId: statement.accountId,
      amount: input.amount,
      date: input.date,
      description: input.description?.trim() || 'Pagamento da fatura',
      status: desiredPaymentStatus({ date: input.date, today: todayOf(deps) }),
      incoming: { statementId: statement.id, statementKey: statement.statementKey },
    })

    const refreshed = await refreshStatement(deps, uow, ctx, statement)
    return {
      transferId: transfer.transferId,
      sourceTransactionId: transfer.outgoing.id,
      cardTransactionId: transfer.incoming.id,
      statement: refreshed.summary,
      overdraftWarning: warning,
      positions: transfer.positions,
      warnings: transfer.warnings,
    }
  })
}
