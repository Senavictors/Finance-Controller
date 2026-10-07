import { normalizeLinks, type TxnLinksInput } from '../domain/links'
import { assertCalendarDate, diffDeltas, signedAmountFor } from '../domain/rules'
import {
  LedgerError,
  TXN_KINDS,
  type AccountPosition,
  type LedgerTxn,
  type LedgerWarning,
  type NewLedgerTxn,
  type ReviewState,
  type TxnKind,
  type TxnSource,
  type TxnStatus,
} from '../domain/types'
import type { LedgerContext, LedgerDeps } from './ports'
import {
  applyDeltas,
  assertAccountWritable,
  assertKnownStatus,
  assertLinkRefs,
  assertRefs,
  loadAccount,
  normalizeDescription,
  normalizeTags,
  notifyMutation,
  positionsFor,
} from './shared'

/**
 * Além dos campos abaixo aceita os vínculos opcionais (`TxnLinksInput`): `statementId`,
 * `statementKey`, `refundOfId`, `seriesId`, `occurrenceKey`, `importBatchId`, `importHash`,
 * `categorySource`, `aiConfidence`. O ledger só valida formato/existência/dono e grava.
 */
export interface CreateTransactionInput extends TxnLinksInput {
  accountId: string
  /** `TRANSFER` e `CARD_PAYMENT` usam `createTransfer`. */
  kind: TxnKind
  /**
   * Valor em centavos **em módulo** (> 0); o use-case aplica o sinal conforme o `kind`
   * (EXPENSE/FEE/INTEREST negativo, INCOME positivo). Só `ADJUSTMENT` recebe valor assinado.
   */
  amount: number
  /** Meio-dia UTC. */
  date: Date
  postedDate?: Date | null
  description: string
  categoryId?: string | null
  merchantId?: string | null
  /** Padrão `CLEARED`; `RECONCILED` não pode ser o status inicial. */
  status?: TxnStatus
  notes?: string | null
  tags?: string[]
  source?: TxnSource
  review?: ReviewState
  rawDescription?: string | null
  excludeFromBudget?: boolean
}

export interface CreateTransactionResult {
  transaction: LedgerTxn
  /** Posição da conta depois do lançamento (saldos, uso do limite). */
  position: AccountPosition
  warnings: LedgerWarning[]
}

/** Cria um lançamento e atualiza o `AccountBalance` na mesma transação (RN-02). */
export async function createTransaction(
  deps: LedgerDeps,
  ctx: LedgerContext,
  input: CreateTransactionInput,
): Promise<CreateTransactionResult> {
  if (!(TXN_KINDS as readonly string[]).includes(input.kind)) {
    throw new LedgerError('LEDGER_INVALID_KIND', `Tipo de lançamento inválido: ${input.kind}.`)
  }
  const amount = signedAmountFor(input.kind, input.amount)
  assertCalendarDate(input.date)
  if (input.postedDate) assertCalendarDate(input.postedDate, 'postedDate')
  const status = input.status ?? 'CLEARED'
  assertKnownStatus(status)
  const description = normalizeDescription(input.description)

  const row: NewLedgerTxn = {
    userId: ctx.userId,
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
    merchantId: input.merchantId ?? null,
    kind: input.kind,
    status,
    review: input.review ?? 'REVIEWED',
    source: input.source ?? 'MANUAL',
    amount,
    date: input.date,
    postedDate: input.postedDate ?? null,
    description,
    rawDescription: input.rawDescription ?? null,
    notes: input.notes ?? null,
    tags: normalizeTags(input.tags),
    transferId: null,
    excludeFromBudget: input.excludeFromBudget ?? false,
    userLocked: {},
    ...normalizeLinks(input),
  }

  const result = await deps.repo.withTransaction(async (tx) => {
    const account = await loadAccount(tx, ctx.userId, input.accountId)
    assertAccountWritable(account, input.kind)
    await assertRefs(tx, ctx.userId, row)
    await assertLinkRefs(tx, ctx.userId, row)

    const [transaction] = await tx.insertTxns([row])
    await applyDeltas(
      tx,
      ctx.userId,
      diffDeltas(null, { accountId: row.accountId, amount, status }),
    )
    const [position] = await positionsFor(tx, ctx.userId, [row.accountId])
    return { transaction, position }
  })

  await notifyMutation(deps, {
    userId: ctx.userId,
    type: 'CREATE',
    accountIds: [result.transaction.accountId],
    transactionIds: [result.transaction.id],
  })
  return { ...result, warnings: result.position.warnings }
}
