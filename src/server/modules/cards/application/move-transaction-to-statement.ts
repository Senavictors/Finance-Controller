import type { LedgerTxn } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import { assertStatementKeyCreatable } from '../domain/move'
import type { CardsContext, CardsDeps, StatementRow } from './ports'
import {
  assertCardTransaction,
  cycleFor,
  cycleForKey,
  draftStatement,
  listAllTransactions,
  isPaidOut,
  liveTotals,
  lockExistingStatements,
  refreshStatement,
  statusFor,
  type StatementSummary,
} from './shared'

/** Kinds de cartão que pertencem a uma fatura e podem ser movidos entre faturas. */
const MOVABLE_KINDS: readonly string[] = ['EXPENSE', 'FEE', 'INTEREST', 'INCOME']

export interface MoveTransactionToStatementInput {
  transactionId: string
  /** `AAAA-MM` da fatura de destino (mês de vencimento). */
  targetStatementKey?: string
  /** Alternativa: id da fatura de destino (precisa ser do mesmo cartão). */
  targetStatementId?: string
}

export interface MoveTransactionToStatementResult {
  transaction: LedgerTxn
  /** Fatura de origem (recalculada); `null` se o lançamento não estava em nenhuma. */
  from: StatementSummary | null
  to: StatementSummary
}

/**
 * Move um lançamento de cartão (compra, tarifa, juros, estorno) para outra fatura do MESMO
 * cartão, como ação do usuário (o banco às vezes lança na fatura seguinte). Não muda `date`
 * nem o saldo da conta; grava `userLocked.statement` (`setTransactionLinks` com `actor: 'USER'`)
 * para o `syncCardStatuses` não devolvê-lo ao ciclo original. Fatura `PAID` não cede nem recebe
 * lançamentos (`STATEMENT_PAID`). Parcela de compra parcelada: move só aquela parcela.
 * O status é reajustado à convenção da fatura de destino (aberta => `PENDING`, fechada =>
 * `CLEARED`), sem tocar em `RECONCILED`.
 */
export async function moveTransactionToStatement(
  deps: CardsDeps,
  ctx: CardsContext,
  input: MoveTransactionToStatementInput,
): Promise<MoveTransactionToStatementResult> {
  if (!input.targetStatementKey && !input.targetStatementId) {
    throw new CardsError(
      'INVALID_STATEMENT_KEY',
      'Informe a fatura de destino (statementKey ou statementId).',
    )
  }

  return deps.ledger.runInTransaction(ctx, async (uow) => {
    const before = await uow.findTransaction(input.transactionId)
    if (!before) throw new CardsError('TRANSACTION_NOT_FOUND', 'Lançamento não encontrado.')
    if (!MOVABLE_KINDS.includes(before.kind)) {
      throw new CardsError(
        'NOT_A_CARD_TRANSACTION',
        'Só compras, tarifas, juros e estornos de cartão podem ser movidos entre faturas.',
        { kind: before.kind },
      )
    }
    const card = await assertCardTransaction(deps, ctx, before, uow.tx)

    // fatura de destino: existente (por id/chave) ou criável (dentro da janela do ciclo)
    let targetKey: string
    if (input.targetStatementId) {
      const target = await deps.repo.findStatement(ctx.userId, input.targetStatementId, uow.tx)
      if (!target) throw new CardsError('STATEMENT_NOT_FOUND', 'Fatura de destino não encontrada.')
      if (target.accountId !== card.id) {
        throw new CardsError(
          'STATEMENT_ACCOUNT_MISMATCH',
          'A fatura de destino pertence a outro cartão.',
        )
      }
      targetKey = target.statementKey
    } else {
      targetKey = input.targetStatementKey!
      const existing = await deps.repo.findStatementByKey(ctx.userId, card.id, targetKey, uow.tx)
      if (!existing) {
        assertStatementKeyCreatable({
          naturalKey: cycleFor(card, before.date).statementKey,
          targetKey,
        })
      }
    }

    // locks: origem e destino numa única chamada (ordenadas por id) ANTES do ledger; mover
    // A->B e B->A ao mesmo tempo não gera deadlock
    const ensured = await deps.repo.ensureStatements(
      ctx.userId,
      [draftStatement(ctx, card, cycleForKey(card, targetKey), deps.uuid())],
      uow.tx,
    )
    const targetId = ensured[0]!.id
    const locked = await lockExistingStatements(deps, uow, ctx, [before.statementId, targetId])
    const target = locked.get(targetId)!
    const source: StatementRow | null = before.statementId
      ? (locked.get(before.statementId) ?? null)
      : null

    // relê depois do lock: se outra requisição moveu/apagou, aborta
    const txn = await uow.findTransaction(before.id)
    if (!txn || txn.statementId !== before.statementId) {
      throw new CardsError(
        'CONCURRENT_UPDATE',
        'O lançamento foi alterado por outra requisição ao mesmo tempo. Tente novamente.',
      )
    }

    // fatura PAID não cede nem recebe lançamentos
    const [sourceItems, targetItems] = await Promise.all([
      source ? listAllTransactions(uow, { statementId: source.id }) : Promise.resolve([]),
      listAllTransactions(uow, { statementId: target.id }),
    ])
    if (
      source &&
      source.id !== target.id &&
      isPaidOut(liveTotals(deps, source, sourceItems).totals)
    ) {
      throw new CardsError(
        'STATEMENT_PAID',
        'A fatura de origem já está paga e não cede lançamentos.',
        {
          statementKey: source.statementKey,
        },
      )
    }
    if (source?.id !== target.id && isPaidOut(liveTotals(deps, target, targetItems).totals)) {
      throw new CardsError(
        'STATEMENT_PAID',
        'A fatura de destino já está paga e não recebe lançamentos.',
        {
          statementKey: target.statementKey,
        },
      )
    }

    // 1) vínculo (trava userLocked.statement); 2) status da convenção da fatura de destino
    await uow.setTransactionLinks(
      txn.id,
      { statementId: target.id, statementKey: target.statementKey },
      { actor: 'USER' },
    )
    const desired = statusFor(deps, txn.date, target)
    if (txn.status !== 'RECONCILED' && txn.status !== desired) {
      await uow.changeTransactionStatus(txn.id, desired)
    }

    const toResult = await refreshStatement(deps, uow, ctx, target)
    const fromResult =
      source && source.id !== target.id ? await refreshStatement(deps, uow, ctx, source) : null
    const moved = (await uow.findTransaction(txn.id))!
    return {
      transaction: moved,
      from: fromResult ? fromResult.summary : source ? toResult.summary : null,
      to: toResult.summary,
    }
  })
}
