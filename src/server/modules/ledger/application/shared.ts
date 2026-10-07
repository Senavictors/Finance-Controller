import { positionOf } from '../domain/balance'
import { linkRefsOf } from '../domain/links'
import { isZeroBuckets } from '../domain/rules'
import { assertTransferPair, isTransferLeg } from '../domain/transfer'
import {
  LedgerError,
  type AccountDelta,
  type AccountPosition,
  type LedgerTxn,
  type LedgerWarning,
  type TxnKind,
  type TxnLinks,
  type TxnStatus,
} from '../domain/types'
import type {
  LedgerAccount,
  LedgerDeps,
  LedgerMutationEvent,
  LedgerReader,
  LedgerTx,
} from './ports'

/** Resultado padrão de mutações que mexem em um lançamento (e, se houver, na outra perna). */
export interface MutationResult {
  transaction: LedgerTxn
  /** Outra perna do par ligado (transferência/pagamento de fatura); `null` nos demais. */
  counterpart: LedgerTxn | null
  /** Posições das contas afetadas, já com uso do limite e avisos. */
  positions: AccountPosition[]
  warnings: LedgerWarning[]
}

export const MAX_DESCRIPTION_LENGTH = 255

export function normalizeDescription(value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length === 0 || trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new LedgerError(
      'LEDGER_INVALID_INPUT',
      `A descrição deve ter de 1 a ${MAX_DESCRIPTION_LENGTH} caracteres.`,
      { field: 'description' },
    )
  }
  return trimmed
}

export function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0))]
}

export async function loadAccount(
  reader: LedgerReader,
  userId: string,
  accountId: string,
): Promise<LedgerAccount> {
  const account = await reader.findAccount(userId, accountId)
  if (!account) {
    throw new LedgerError('LEDGER_ACCOUNT_NOT_FOUND', 'Conta não encontrada.', { accountId })
  }
  return account
}

/** Conta arquivada só aceita `ADJUSTMENT` (RN-06). */
export function assertAccountWritable(account: LedgerAccount, kind: TxnKind): void {
  if (account.isArchived && kind !== 'ADJUSTMENT') {
    throw new LedgerError(
      'LEDGER_ACCOUNT_ARCHIVED',
      'Conta arquivada só aceita lançamentos do tipo ajuste.',
      { accountId: account.id },
    )
  }
}

export async function assertRefs(
  reader: LedgerReader,
  userId: string,
  refs: { categoryId?: string | null; merchantId?: string | null },
): Promise<void> {
  if (!refs.categoryId && !refs.merchantId) return
  const found = await reader.refsExist(userId, refs)
  if (refs.categoryId && !found.category) {
    throw new LedgerError('LEDGER_CATEGORY_NOT_FOUND', 'Categoria não encontrada.')
  }
  if (refs.merchantId && !found.merchant) {
    throw new LedgerError('LEDGER_MERCHANT_NOT_FOUND', 'Estabelecimento não encontrado.')
  }
}

/**
 * Confere que os vínculos para outras tabelas (fatura, série, lote, lançamento original de
 * estorno) existem e são do usuário. `LEDGER_LINK_NOT_FOUND` (404) com `details.field`.
 */
export async function assertLinkRefs(
  reader: LedgerReader,
  userId: string,
  links: Partial<TxnLinks>,
  self?: { id: string },
): Promise<void> {
  const refs = linkRefsOf(links)
  const notFound = (field: string) =>
    new LedgerError('LEDGER_LINK_NOT_FOUND', `Vínculo não encontrado: ${field}.`, { field })
  if (refs.statementId || refs.seriesId || refs.importBatchId) {
    const found = await reader.linkRefsExist(userId, refs)
    if (refs.statementId && !found.statement) throw notFound('statementId')
    if (refs.seriesId && !found.series) throw notFound('seriesId')
    if (refs.importBatchId && !found.importBatch) throw notFound('importBatchId')
  }
  if (refs.refundOfId) {
    if (self && refs.refundOfId === self.id) {
      throw new LedgerError('LEDGER_INVALID_LINK', 'Um lançamento não pode estornar a si mesmo.', {
        field: 'refundOfId',
      })
    }
    const original = await reader.findTxn(userId, refs.refundOfId)
    if (!original) throw notFound('refundOfId')
  }
}

export async function loadTxn(
  reader: LedgerReader,
  userId: string,
  id: string,
): Promise<LedgerTxn> {
  const txn = await reader.findTxn(userId, id)
  if (!txn) throw new LedgerError('LEDGER_TXN_NOT_FOUND', 'Lançamento não encontrado.', { id })
  return txn
}

/**
 * Lê o lançamento **travando** a linha (e a da outra perna, se for par ligado) e devolve o
 * estado commitado atual: `[txn]` ou `[txn, counterpart]`. É a leitura que toda mutação com
 * delta de saldo usa (update/status/delete): serializa requisições simultâneas sobre o mesmo
 * lançamento e as duas pernas de um par, que travam juntas numa ordem única (sem deadlock).
 * Lançamento apagado enquanto esperávamos o lock vira `LEDGER_TXN_NOT_FOUND`.
 */
export async function loadLockedWithCounterpart(
  tx: LedgerTx,
  userId: string,
  id: string,
): Promise<LedgerTxn[]> {
  const peek = await loadTxn(tx, userId, id)
  let ids = [id]
  if (isTransferLeg(peek) && peek.transferId !== null) {
    const legs = await tx.findTransferLegs(userId, peek.transferId)
    ids = [...new Set([id, ...legs.map((leg) => leg.id)])]
  }
  const locked = await tx.lockTxns(userId, ids)
  const txn = locked.find((row) => row.id === id)
  if (!txn) throw new LedgerError('LEDGER_TXN_NOT_FOUND', 'Lançamento não encontrado.', { id })
  if (!isTransferLeg(txn) || txn.transferId === null) return [txn]

  const legs = locked.filter((row) => row.transferId === txn.transferId)
  assertTransferPair(legs)
  const other = legs.find((leg) => leg.id !== txn.id)
  if (!other) {
    throw new LedgerError('LEDGER_TRANSFER_PAIR_BROKEN', 'Par de transferência inconsistente.')
  }
  return [txn, other]
}

/** Falha se `deleteTxns` removeu menos linhas que o esperado (outra transação chegou antes). */
export function assertAllDeleted(deleted: number, expected: number): void {
  if (deleted !== expected) {
    throw new LedgerError(
      'LEDGER_CONCURRENT_UPDATE',
      'O lançamento foi alterado por outra requisição ao mesmo tempo. Tente novamente.',
    )
  }
}

/**
 * Aplica deltas por incremento atômico. A lista chega ordenada por conta (`diffDeltas`/
 * `mergeDeltas`), o que mantém a ordem de lock estável entre transferências opostas.
 */
export async function applyDeltas(
  tx: LedgerTx,
  userId: string,
  deltas: AccountDelta[],
): Promise<void> {
  for (const { accountId, delta } of deltas) {
    if (isZeroBuckets(delta)) continue
    await tx.incrementBalance(userId, accountId, delta)
  }
}

/** Posições (lidas após as escritas, dentro da mesma transação), sem repetir contas. */
export async function positionsFor(
  reader: LedgerReader,
  userId: string,
  accountIds: string[],
): Promise<AccountPosition[]> {
  const positions: AccountPosition[] = []
  for (const accountId of [...new Set(accountIds)]) {
    const account = await reader.findAccount(userId, accountId)
    if (!account) continue
    const balance = await reader.findBalance(userId, accountId)
    positions.push(buildPosition(account, balance))
  }
  return positions
}

export function buildPosition(
  account: LedgerAccount,
  balance: {
    balanceCleared: number
    balancePending: number
    balancePlanned: number
  } | null,
): AccountPosition {
  return positionOf({
    accountId: account.id,
    accountType: account.type,
    balanceCleared: balance?.balanceCleared ?? 0,
    balancePending: balance?.balancePending ?? 0,
    balancePlanned: balance?.balancePlanned ?? 0,
    overdraftLimit: account.overdraftLimit,
    creditLimit: account.creditLimit,
  })
}

export function collectWarnings(positions: AccountPosition[]): LedgerWarning[] {
  return positions.flatMap((p) => p.warnings)
}

/** Hook pós-commit; falhas não desfazem a mutação (F3 plugará projeções idempotentes). */
export async function notifyMutation(
  deps: LedgerDeps,
  event: Omit<LedgerMutationEvent, 'at'>,
): Promise<void> {
  if (!deps.afterLedgerMutation) return
  try {
    await deps.afterLedgerMutation({ ...event, at: deps.clock() })
  } catch {
    // intencional: o ledger já foi confirmado.
  }
}

export function assertKnownStatus(status: TxnStatus, allowReconciled = false): void {
  const valid: readonly string[] = allowReconciled
    ? ['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED']
    : ['PLANNED', 'PENDING', 'CLEARED']
  if (!valid.includes(status)) {
    throw new LedgerError(
      'LEDGER_INVALID_INPUT',
      `Status inválido para esta operação: ${status}.`,
      {
        field: 'status',
      },
    )
  }
}
