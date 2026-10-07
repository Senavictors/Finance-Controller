import { diffDeltas, mergeDeltas } from '../domain/rules'
import { buildTransferLegs } from '../domain/transfer'
import {
  LedgerError,
  type AccountPosition,
  type LedgerTxn,
  type LedgerWarning,
  type ReviewState,
  type TransferKind,
  type TxnSource,
  type TxnStatus,
} from '../domain/types'
import type { LedgerContext, LedgerDeps } from './ports'
import {
  applyDeltas,
  assertAccountWritable,
  assertKnownStatus,
  collectWarnings,
  loadAccount,
  normalizeDescription,
  normalizeTags,
  notifyMutation,
  positionsFor,
} from './shared'

export interface CreateTransferInput {
  sourceAccountId: string
  destinationAccountId: string
  /** Centavos em módulo (> 0). */
  amount: number
  /** Meio-dia UTC. */
  date: Date
  description: string
  /** Padrão `CLEARED`; vale para as duas pernas. */
  status?: TxnStatus
  /** Padrão `TRANSFER`; `CARD_PAYMENT` é usado pela F1-03 (pagamento de fatura). */
  kind?: TransferKind
  postedDate?: Date | null
  notes?: string | null
  tags?: string[]
  source?: TxnSource
  review?: ReviewState
}

export interface CreateTransferResult {
  transferId: string
  outgoing: LedgerTxn
  incoming: LedgerTxn
  /** `[origem, destino]`. */
  positions: AccountPosition[]
  warnings: LedgerWarning[]
}

/**
 * Cria o par ligado por `transferId` (ADR-004): `-amount` na origem e `+amount` no destino,
 * e aplica os dois deltas ao `AccountBalance`, tudo na mesma transação. Se qualquer escrita
 * falhar, nada é gravado e nenhum saldo muda.
 */
export async function createTransfer(
  deps: LedgerDeps,
  ctx: LedgerContext,
  input: CreateTransferInput,
): Promise<CreateTransferResult> {
  const status = input.status ?? 'CLEARED'
  assertKnownStatus(status)
  const kind = input.kind ?? 'TRANSFER'
  const legs = buildTransferLegs({
    userId: ctx.userId,
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    amount: input.amount,
    date: input.date,
    kind,
    description: normalizeDescription(input.description),
    status,
    uuid: deps.uuid,
    postedDate: input.postedDate,
    notes: input.notes,
    tags: normalizeTags(input.tags),
    source: input.source,
    review: input.review,
  })

  const result = await deps.repo.withTransaction(async (tx) => {
    const source = await loadAccount(tx, ctx.userId, input.sourceAccountId)
    const destination = await loadAccount(tx, ctx.userId, input.destinationAccountId)
    assertAccountWritable(source, kind)
    assertAccountWritable(destination, kind)
    if (kind === 'TRANSFER' && source.type === 'CREDIT_CARD') {
      throw new LedgerError(
        'LEDGER_CARD_TRANSFER_SOURCE',
        'Cartão de crédito não pode ser origem de transferência; pagamento de fatura usa CARD_PAYMENT.',
        { accountId: source.id },
      )
    }

    const [outgoing, incoming] = await tx.insertTxns([legs.outgoing, legs.incoming])
    await applyDeltas(
      tx,
      ctx.userId,
      mergeDeltas(
        diffDeltas(null, { accountId: outgoing.accountId, amount: outgoing.amount, status }),
        diffDeltas(null, { accountId: incoming.accountId, amount: incoming.amount, status }),
      ),
    )
    const positions = await positionsFor(tx, ctx.userId, [source.id, destination.id])
    return { outgoing, incoming, positions }
  })

  await notifyMutation(deps, {
    userId: ctx.userId,
    type: 'TRANSFER',
    accountIds: [input.sourceAccountId, input.destinationAccountId],
    transactionIds: [result.outgoing.id, result.incoming.id],
  })
  return {
    transferId: legs.transferId,
    ...result,
    warnings: collectWarnings(result.positions),
  }
}
