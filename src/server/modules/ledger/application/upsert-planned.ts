import { normalizeLinks, normalizeLinksPatch } from '../domain/links'
import { signedAmountFor } from '../domain/rules'
import {
  LedgerError,
  TXN_LINK_FIELDS,
  type AccountPosition,
  type LedgerTxn,
  type LedgerWarning,
} from '../domain/types'
import { createTransaction, type CreateTransactionInput } from './create-transaction'
import type { LedgerContext, LedgerDeps, LedgerTx } from './ports'
import { setTransactionLinks } from './set-links'
import { normalizeDescription, normalizeTags, positionsFor } from './shared'
import { updateTransaction, type UpdateTransactionInput } from './update-transaction'

export interface UpsertPlannedInput extends Omit<
  CreateTransactionInput,
  'status' | 'occurrenceKey'
> {
  /** Chave de idempotência (única por usuário), ex.: `<seriesId>:2026-11-05` ou `das:2026-11-20`. */
  occurrenceKey: string
}

export type UpsertPlannedAction = 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'SKIPPED'

export interface UpsertPlannedResult {
  /**
   * `CREATED`: não existia, criado `PLANNED`. `UPDATED`: existia `PLANNED` e mudou valor/data/
   * descrição/conta/kind. `UNCHANGED`: existia `PLANNED` igual (ou com os campos divergentes
   * travados por `userLocked`). `SKIPPED`: existe e já não é `PLANNED` (nada é alterado).
   */
  action: UpsertPlannedAction
  /** `'NOT_PLANNED'` só quando `action = 'SKIPPED'`. */
  skipped: 'NOT_PLANNED' | null
  /** Estado atual do lançamento da chave (depois do upsert). */
  transaction: LedgerTxn
  position: AccountPosition
  warnings: LedgerWarning[]
  /** Campos divergentes ignorados por estarem em `userLocked` (ADR-024). */
  skippedFields: string[]
}

/** Valida e normaliza uma chave de idempotência (`LEDGER_INVALID_LINK` se vazia/inválida). */
export function normalizeOccurrenceKey(raw: string): string {
  const key = normalizeLinks({ occurrenceKey: raw }).occurrenceKey
  if (key === null) {
    throw new LedgerError('LEDGER_INVALID_LINK', 'occurrenceKey é obrigatória.', {
      field: 'occurrenceKey',
    })
  }
  return key
}

function keyOf(input: UpsertPlannedInput): string {
  return normalizeOccurrenceKey(input.occurrenceKey)
}

/**
 * Previsto idempotente por `occurrenceKey` (única por usuário), seguro sob concorrência.
 * `deps` deve estar ligado à transação corrente (`bindToTransaction`); `tx` é essa transação.
 *
 * 1. Trava a chave (`lockOccurrenceKeys`) antes de ler: chamadas simultâneas na mesma chave
 *    entram em fila, inclusive quando a linha ainda não existe.
 * 2. Não existe: cria `PLANNED` (`source` padrão `RECURRING`).
 * 3. Existe e `PLANNED`: aplica o que mudou (valor, data, descrição, conta, kind, e, quando
 *    informados, categoria, estabelecimento, notas, tags e vínculos) como engine
 *    (`actor: 'SYSTEM'`): campos em `userLocked` são preservados; os deltas de `balancePlanned`
 *    saem do `updateTransaction`. Campo omitido (`undefined`) não é tocado; `null` limpa.
 * 4. Existe e não é `PLANNED` (já confirmado/conciliado): não toca em nada.
 */
export async function upsertPlannedInTransaction(
  deps: LedgerDeps,
  tx: LedgerTx,
  ctx: LedgerContext,
  input: UpsertPlannedInput,
): Promise<UpsertPlannedResult> {
  const occurrenceKey = keyOf(input)
  const normalized: UpsertPlannedInput = { ...input, occurrenceKey }
  await tx.lockOccurrenceKeys(ctx.userId, [occurrenceKey])

  // A linha pode sumir entre achar a chave e travá-la (DELETE concorrente): relê uma vez.
  for (let attempt = 0; attempt < 2; attempt++) {
    const found = await tx.findTxnByOccurrenceKey(ctx.userId, occurrenceKey)
    if (!found) break
    const [existing] = await tx.lockTxns(ctx.userId, [found.id])
    if (!existing) continue
    return applyToExisting(deps, tx, ctx, normalized, existing)
  }

  const created = await createTransaction(deps, ctx, {
    ...normalized,
    status: 'PLANNED',
    source: normalized.source ?? 'RECURRING',
  })
  return {
    action: 'CREATED',
    skipped: null,
    transaction: created.transaction,
    position: created.position,
    warnings: created.warnings,
    skippedFields: [],
  }
}

/**
 * Vários previstos numa transação. Trava TODAS as chaves em ordem crescente antes de qualquer
 * escrita: duas execuções com conjuntos de chaves diferentes não formam ciclo de espera
 * (deadlock). Prefira este método a um laço de `upsertPlannedByOccurrenceKey`.
 */
export async function upsertPlannedBatchInTransaction(
  deps: LedgerDeps,
  tx: LedgerTx,
  ctx: LedgerContext,
  inputs: UpsertPlannedInput[],
): Promise<UpsertPlannedResult[]> {
  const keys = inputs.map(keyOf)
  await tx.lockOccurrenceKeys(ctx.userId, keys)
  const results: UpsertPlannedResult[] = []
  for (const input of inputs) {
    results.push(await upsertPlannedInTransaction(deps, tx, ctx, input))
  }
  return results
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index])
}

async function applyToExisting(
  deps: LedgerDeps,
  tx: LedgerTx,
  ctx: LedgerContext,
  input: UpsertPlannedInput,
  existing: LedgerTxn,
): Promise<UpsertPlannedResult> {
  const unchanged = async (
    action: 'UNCHANGED' | 'SKIPPED',
    skippedFields: string[] = [],
  ): Promise<UpsertPlannedResult> => {
    const [position] = await positionsFor(tx, ctx.userId, [existing.accountId])
    return {
      action,
      skipped: action === 'SKIPPED' ? 'NOT_PLANNED' : null,
      transaction: existing,
      position: position!,
      warnings: position!.warnings,
      skippedFields,
    }
  }

  if (existing.status !== 'PLANNED') return unchanged('SKIPPED')

  const patch: UpdateTransactionInput = {}
  // O valor é validado e assinado como na criação; só entra no patch se mudou.
  const nextAmount = signedAmountFor(input.kind, input.amount)
  if (nextAmount !== existing.amount) patch.amount = input.amount
  if (input.date.getTime() !== existing.date.getTime()) patch.date = input.date
  if (normalizeDescription(input.description) !== existing.description) {
    patch.description = input.description
  }
  if (input.accountId !== existing.accountId) patch.accountId = input.accountId
  if (input.kind !== existing.kind) patch.kind = input.kind
  // Campos opcionais: `undefined` = não informado (não toca); `null` limpa.
  if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
    patch.categoryId = input.categoryId
  }
  if (input.merchantId !== undefined && input.merchantId !== existing.merchantId) {
    patch.merchantId = input.merchantId
  }
  if (input.notes !== undefined && input.notes !== existing.notes) patch.notes = input.notes
  if (input.tags !== undefined && !sameTags(normalizeTags(input.tags), existing.tags)) {
    patch.tags = input.tags
  }

  // Vínculos informados (a chave de idempotência é a própria identidade: não muda).
  const wantedLinks = normalizeLinksPatch({ ...input, occurrenceKey: undefined })
  const linkPatch: Record<string, unknown> = {}
  for (const field of TXN_LINK_FIELDS) {
    if (field === 'occurrenceKey' || !(field in wantedLinks)) continue
    if (wantedLinks[field] !== existing[field]) linkPatch[field] = wantedLinks[field]
  }

  if (Object.keys(patch).length === 0 && Object.keys(linkPatch).length === 0) {
    return unchanged('UNCHANGED')
  }

  let transaction = existing
  let applied = 0
  const skippedFields: string[] = []
  let positions: AccountPosition[] = []
  let warnings: LedgerWarning[] = []

  if (Object.keys(patch).length > 0) {
    const updated = await updateTransaction(deps, ctx, existing.id, patch, { actor: 'SYSTEM' })
    transaction = updated.transaction
    applied += Object.keys(patch).length - updated.skippedFields.length
    skippedFields.push(...updated.skippedFields)
    positions = updated.positions
    warnings = updated.warnings
  }

  // A origem da categoria acompanha a categoria: se ela está travada pelo usuário, fica também.
  if (skippedFields.includes('categoryId')) {
    delete linkPatch.categorySource
    delete linkPatch.aiConfidence
  }
  if (Object.keys(linkPatch).length > 0) {
    const linked = await setTransactionLinks(deps, ctx, existing.id, linkPatch, {
      actor: 'SYSTEM',
    })
    const { skippedFields: linkSkipped, ...row } = linked
    transaction = row
    applied += Object.keys(linkPatch).length - linkSkipped.length
    skippedFields.push(...linkSkipped)
  }

  const position =
    positions.find((p) => p.accountId === transaction.accountId) ??
    (await positionsFor(tx, ctx.userId, [transaction.accountId]))[0]!
  return {
    action: applied > 0 ? 'UPDATED' : 'UNCHANGED',
    skipped: null,
    transaction,
    position,
    warnings: positions.length > 0 ? warnings : position.warnings,
    skippedFields,
  }
}
