import {
  assertAmountInRange,
  assertCalendarDate,
  diffDeltas,
  mergeDeltas,
  reconciledBlockedFields,
  signedAmountFor,
  validateStatusChange,
} from '../domain/rules'
import { isTransferKind } from '../domain/transfer'
import {
  LedgerError,
  TXN_KINDS,
  type LedgerTxn,
  type TxnKind,
  type TxnStatus,
  type UserLocked,
} from '../domain/types'
import type { LedgerContext, LedgerDeps, TxnPatch } from './ports'
import {
  applyDeltas,
  assertAccountWritable,
  assertKnownStatus,
  assertRefs,
  collectWarnings,
  loadAccount,
  loadLockedWithCounterpart,
  normalizeDescription,
  normalizeTags,
  notifyMutation,
  positionsFor,
  type MutationResult,
} from './shared'

export interface UpdateTransactionInput {
  /**
   * Valor em módulo (> 0) para qualquer kind exceto `ADJUSTMENT` (assinado). Em perna de
   * transferência, vale para as duas pernas (sinais opostos preservados).
   */
  amount?: number
  date?: Date
  postedDate?: Date | null
  description?: string
  categoryId?: string | null
  merchantId?: string | null
  notes?: string | null
  tags?: string[]
  status?: TxnStatus
  accountId?: string
  kind?: TxnKind
  excludeFromBudget?: boolean
}

export interface UpdateTransactionOptions {
  /**
   * `USER` (padrão): edição manual, registra os campos em `userLocked` (ADR-024).
   * `SYSTEM`: engines e importadores; campos já travados pelo usuário são ignorados
   * (`skippedFields`) e nada é travado.
   */
  actor?: 'USER' | 'SYSTEM'
}

export interface UpdateTransactionResult extends MutationResult {
  /** Campos do patch ignorados por estarem em `userLocked` (só com `actor: 'SYSTEM'`). */
  skippedFields: string[]
}

/** Campos que, ao serem editados pelo usuário, passam a vencer qualquer engine. */
const LOCKABLE_FIELDS = [
  'amount',
  'date',
  'description',
  'categoryId',
  'merchantId',
  'notes',
  'tags',
  'accountId',
  'kind',
  'excludeFromBudget',
] as const

/** Campos propagados às duas pernas de um par. */
const PAIR_PROPAGATED = ['amount', 'date', 'description'] as const

function lockFields(base: UserLocked, fields: readonly string[]): UserLocked {
  const next = { ...base }
  for (const field of fields) next[field] = true
  return next
}

/**
 * Edita um lançamento. Aplica `diffDeltas` ao `AccountBalance` na mesma transação.
 * Em perna de transferência, valor/data/descrição/status propagam às duas pernas;
 * `accountId` e `kind` são imutáveis. `RECONCILED` só aceita rótulos (RN-05).
 */
export async function updateTransaction(
  deps: LedgerDeps,
  ctx: LedgerContext,
  id: string,
  input: UpdateTransactionInput,
  opts: UpdateTransactionOptions = {},
): Promise<UpdateTransactionResult> {
  const actor = opts.actor ?? 'USER'
  const requested = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as UpdateTransactionInput
  if (Object.keys(requested).length === 0) {
    throw new LedgerError('LEDGER_EMPTY_PATCH', 'Nenhum campo informado para atualizar.')
  }
  if (requested.kind !== undefined && !(TXN_KINDS as readonly string[]).includes(requested.kind)) {
    throw new LedgerError('LEDGER_INVALID_KIND', `Tipo de lançamento inválido: ${requested.kind}.`)
  }
  if (requested.status !== undefined) assertKnownStatus(requested.status, true)

  const result = await deps.repo.withTransaction(async (tx) => {
    const legs = await loadLockedWithCounterpart(tx, ctx.userId, id)
    const txn = legs[0]!
    const counterpart: LedgerTxn | null = legs[1] ?? null

    // userLocked vence engines (ADR-024).
    const patch: UpdateTransactionInput = { ...requested }
    const skippedFields: string[] = []
    if (actor === 'SYSTEM') {
      for (const key of Object.keys(patch)) {
        const lockedHere = txn.userLocked[key] === true
        const lockedThere =
          counterpart !== null &&
          (PAIR_PROPAGATED as readonly string[]).includes(key) &&
          counterpart.userLocked[key] === true
        if (lockedHere || lockedThere) {
          delete (patch as Record<string, unknown>)[key]
          skippedFields.push(key)
        }
      }
      if (Object.keys(patch).length === 0) {
        const positions = await positionsFor(tx, ctx.userId, [txn.accountId])
        return {
          transaction: txn,
          counterpart,
          positions,
          skippedFields,
          changedIds: [] as string[],
        }
      }
    }

    // RN-05: conciliado só aceita rótulos (qualquer perna conciliada trava o par).
    const blocked = reconciledBlockedFields(patch)
    if (blocked.length > 0 && legs.some((leg) => leg.status === 'RECONCILED')) {
      throw new LedgerError(
        'LEDGER_RECONCILED_LOCKED',
        'Lançamento conciliado só permite alterar categoria, notas, tags e estabelecimento.',
        { blockedFields: blocked },
      )
    }

    const isPair = counterpart !== null
    if (isPair) {
      if (patch.accountId !== undefined && patch.accountId !== txn.accountId) {
        throw new LedgerError(
          'LEDGER_TRANSFER_ACCOUNT_IMMUTABLE',
          'A conta de uma perna de transferência não pode ser alterada: apague e recrie a transferência.',
        )
      }
      if (patch.kind !== undefined && patch.kind !== txn.kind) {
        throw new LedgerError(
          'LEDGER_TRANSFER_KIND_IMMUTABLE',
          'O tipo de uma transferência não pode ser alterado.',
        )
      }
      if (patch.excludeFromBudget === false) {
        throw new LedgerError(
          'LEDGER_INVALID_INPUT',
          'Transferências ficam sempre fora do orçamento.',
          { field: 'excludeFromBudget' },
        )
      }
    } else if (patch.kind !== undefined && isTransferKind(patch.kind)) {
      throw new LedgerError(
        'LEDGER_USE_TRANSFER',
        'Para virar transferência, crie o par com createTransfer.',
      )
    }

    // ---- novos valores --------------------------------------------------------------
    const newKind = patch.kind ?? txn.kind
    const newAccountId = isPair ? txn.accountId : (patch.accountId ?? txn.accountId)
    let newAmount = txn.amount
    let counterpartAmount = counterpart?.amount ?? 0
    if (isPair) {
      if (patch.amount !== undefined) {
        assertAmountInRange(patch.amount)
        if (patch.amount === 0) {
          throw new LedgerError('LEDGER_ZERO_AMOUNT', 'O valor do lançamento não pode ser zero.')
        }
        if (patch.amount < 0) {
          throw new LedgerError(
            'LEDGER_INVALID_SIGN',
            'Informe o valor da transferência em módulo (positivo).',
          )
        }
        newAmount = txn.amount < 0 ? 0 - patch.amount : patch.amount
        counterpartAmount = 0 - newAmount
      }
    } else if (patch.amount !== undefined) {
      newAmount = signedAmountFor(newKind, patch.amount)
    } else if (newKind !== txn.kind && newKind !== 'ADJUSTMENT') {
      newAmount = signedAmountFor(newKind, Math.abs(txn.amount))
    }

    if (patch.date !== undefined) assertCalendarDate(patch.date)
    if (patch.postedDate) assertCalendarDate(patch.postedDate, 'postedDate')
    const description =
      patch.description !== undefined ? normalizeDescription(patch.description) : undefined

    if (!isPair && newAccountId !== txn.accountId) {
      const target = await loadAccount(tx, ctx.userId, newAccountId)
      assertAccountWritable(target, newKind)
    }
    await assertRefs(tx, ctx.userId, patch)

    // ---- status (por perna) ---------------------------------------------------------
    const to = patch.status
    let primaryStatus = txn.status
    let counterpartStatus = counterpart?.status ?? txn.status
    if (to !== undefined) {
      validateStatusChange(txn.status, to)
      primaryStatus = to
      // Conciliação é por conta: RECONCILED nunca propaga à outra perna.
      if (counterpart && to !== 'RECONCILED') {
        validateStatusChange(counterpart.status, to)
        counterpartStatus = to
      }
    }

    // ---- patches de persistência ----------------------------------------------------
    const lockedFields = actor === 'USER' ? LOCKABLE_FIELDS.filter((f) => f in patch) : []
    const primaryPatch: TxnPatch = {}
    if (!isPair && newAccountId !== txn.accountId) primaryPatch.accountId = newAccountId
    if (!isPair && newKind !== txn.kind) primaryPatch.kind = newKind
    if (newAmount !== txn.amount) primaryPatch.amount = newAmount
    if (primaryStatus !== txn.status) primaryPatch.status = primaryStatus
    if (patch.date !== undefined) primaryPatch.date = patch.date
    if (patch.postedDate !== undefined) primaryPatch.postedDate = patch.postedDate
    if (description !== undefined) primaryPatch.description = description
    if (patch.categoryId !== undefined) primaryPatch.categoryId = patch.categoryId
    if (patch.merchantId !== undefined) primaryPatch.merchantId = patch.merchantId
    if (patch.notes !== undefined) primaryPatch.notes = patch.notes
    if (patch.tags !== undefined) primaryPatch.tags = normalizeTags(patch.tags)
    if (patch.excludeFromBudget !== undefined)
      primaryPatch.excludeFromBudget = patch.excludeFromBudget
    if (lockedFields.length > 0) primaryPatch.userLocked = lockFields(txn.userLocked, lockedFields)

    const counterpartPatch: TxnPatch = {}
    if (counterpart) {
      if (counterpartAmount !== counterpart.amount) counterpartPatch.amount = counterpartAmount
      if (counterpartStatus !== counterpart.status) counterpartPatch.status = counterpartStatus
      if (patch.date !== undefined) counterpartPatch.date = patch.date
      if (description !== undefined) counterpartPatch.description = description
      const propagatedLocks = lockedFields.filter((f) =>
        (PAIR_PROPAGATED as readonly string[]).includes(f),
      )
      if (propagatedLocks.length > 0) {
        counterpartPatch.userLocked = lockFields(counterpart.userLocked, propagatedLocks)
      }
    }

    // ---- deltas de saldo ------------------------------------------------------------
    const deltas = mergeDeltas(
      diffDeltas(
        { accountId: txn.accountId, amount: txn.amount, status: txn.status },
        { accountId: newAccountId, amount: newAmount, status: primaryStatus },
      ),
      counterpart
        ? diffDeltas(
            {
              accountId: counterpart.accountId,
              amount: counterpart.amount,
              status: counterpart.status,
            },
            {
              accountId: counterpart.accountId,
              amount: counterpartAmount,
              status: counterpartStatus,
            },
          )
        : [],
    )

    const changedIds: string[] = []
    let updated = txn
    if (Object.keys(primaryPatch).length > 0) {
      updated = await tx.updateTxn(ctx.userId, txn.id, primaryPatch)
      changedIds.push(txn.id)
    }
    let updatedCounterpart = counterpart
    if (counterpart && Object.keys(counterpartPatch).length > 0) {
      updatedCounterpart = await tx.updateTxn(ctx.userId, counterpart.id, counterpartPatch)
      changedIds.push(counterpart.id)
    }
    await applyDeltas(tx, ctx.userId, deltas)

    const positions = await positionsFor(tx, ctx.userId, [
      txn.accountId,
      newAccountId,
      ...(counterpart ? [counterpart.accountId] : []),
    ])
    return {
      transaction: updated,
      counterpart: updatedCounterpart,
      positions,
      skippedFields,
      changedIds,
    }
  })

  if (result.changedIds.length > 0) {
    await notifyMutation(deps, {
      userId: ctx.userId,
      type: 'UPDATE',
      accountIds: result.positions.map((p) => p.accountId),
      transactionIds: result.changedIds,
    })
  }
  return {
    transaction: result.transaction,
    counterpart: result.counterpart,
    positions: result.positions,
    warnings: collectWarnings(result.positions),
    skippedFields: result.skippedFields,
  }
}
