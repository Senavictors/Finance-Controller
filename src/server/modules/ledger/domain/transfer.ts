import { assertAmountInRange, assertCalendarDate } from './rules'
import {
  LedgerError,
  TRANSFER_KINDS,
  type NewLedgerTxn,
  type ReviewState,
  type TransferKind,
  type TxnKind,
  type TxnSource,
  type TxnStatus,
} from './types'

export interface BuildTransferLegsInput {
  userId: string
  sourceAccountId: string
  destinationAccountId: string
  /** Valor informado em módulo (centavos, > 0). O sinal é aplicado aqui. */
  amount: number
  /** Meio-dia UTC. */
  date: Date
  kind: TransferKind
  description: string
  status: TxnStatus
  /** Gerador de UUID v4 injetável (determinismo em teste). */
  uuid: () => string
  postedDate?: Date | null
  notes?: string | null
  tags?: string[]
  source?: TxnSource
  review?: ReviewState
}

export interface TransferLegs {
  transferId: string
  /** Perna da origem: `-amount`. */
  outgoing: NewLedgerTxn
  /** Perna do destino: `+amount`. */
  incoming: NewLedgerTxn
}

export function isTransferKind(kind: TxnKind): kind is TransferKind {
  return (TRANSFER_KINDS as readonly TxnKind[]).includes(kind)
}

/** Perna de um par ligado (`TRANSFER` ou `CARD_PAYMENT` com `transferId`). */
export function isTransferLeg(txn: { kind: TxnKind; transferId: string | null }): boolean {
  return isTransferKind(txn.kind) && txn.transferId !== null
}

/**
 * Monta as duas pernas de uma transferência (ADR-004): `-amount` na origem, `+amount` no
 * destino, mesmo `transferId`, mesmo status/data/descrição. Pares ficam fora de orçamento
 * (`excludeFromBudget = true`): transferir não é gastar nem receber (dupla contagem é bug).
 */
export function buildTransferLegs(input: BuildTransferLegsInput): TransferLegs {
  if (!isTransferKind(input.kind)) {
    throw new LedgerError(
      'LEDGER_INVALID_KIND',
      'Par ligado só existe para TRANSFER e CARD_PAYMENT.',
      {
        kind: input.kind,
      },
    )
  }
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new LedgerError('LEDGER_SAME_ACCOUNT', 'Origem e destino devem ser contas diferentes.')
  }
  assertAmountInRange(input.amount)
  if (input.amount === 0) {
    throw new LedgerError('LEDGER_ZERO_AMOUNT', 'O valor da transferência deve ser maior que zero.')
  }
  if (input.amount < 0) {
    throw new LedgerError(
      'LEDGER_INVALID_SIGN',
      'Informe o valor da transferência em módulo (positivo).',
    )
  }
  assertCalendarDate(input.date)
  if (input.postedDate) assertCalendarDate(input.postedDate, 'postedDate')

  const transferId = input.uuid()
  const common = {
    userId: input.userId,
    categoryId: null,
    merchantId: null,
    kind: input.kind,
    status: input.status,
    review: input.review ?? 'REVIEWED',
    source: input.source ?? 'MANUAL',
    date: input.date,
    postedDate: input.postedDate ?? null,
    description: input.description,
    rawDescription: null,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    transferId,
    excludeFromBudget: true,
    userLocked: {},
  } satisfies Omit<NewLedgerTxn, 'accountId' | 'amount'>

  return {
    transferId,
    outgoing: {
      ...common,
      accountId: input.sourceAccountId,
      amount: 0 - input.amount,
      tags: [...common.tags],
    },
    incoming: {
      ...common,
      accountId: input.destinationAccountId,
      amount: input.amount,
      tags: [...common.tags],
    },
  }
}

export interface PairLeg {
  accountId: string
  kind: TxnKind
  amount: number
  transferId: string | null
}

/**
 * Valida um par já gravado: duas pernas, mesmo `transferId` e kind, contas distintas e soma
 * zero (invariante do ADR-019). Lança `LEDGER_TRANSFER_PAIR_BROKEN` caso contrário.
 */
export function assertTransferPair(legs: readonly PairLeg[]): void {
  const [a, b] = legs
  const broken = (reason: string) =>
    new LedgerError(
      'LEDGER_TRANSFER_PAIR_BROKEN',
      `Par de transferência inconsistente: ${reason}.`,
      {
        reason,
      },
    )
  if (legs.length !== 2 || !a || !b) throw broken('esperadas exatamente 2 pernas')
  if (a.transferId === null || a.transferId !== b.transferId) throw broken('transferId diferente')
  if (a.kind !== b.kind || !isTransferKind(a.kind)) throw broken('kind diferente')
  if (a.accountId === b.accountId) throw broken('as duas pernas estão na mesma conta')
  if (a.amount + b.amount !== 0 || a.amount === 0) throw broken('a soma das pernas não é zero')
}
