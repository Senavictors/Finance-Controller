import {
  STATEMENT_LOCK_KEY,
  STATEMENT_LOCKED_FIELDS,
  normalizeLinksPatch,
  type TxnLinksInput,
} from '../domain/links'
import { LedgerError, type LedgerTxn, type TxnLinks } from '../domain/types'
import type { LedgerContext, LedgerDeps, TxnPatch } from './ports'
import { assertLinkRefs, notifyMutation } from './shared'

export interface SetTransactionLinksOptions {
  /**
   * `USER`: ação manual do usuário. Se o patch traz `statementId`/`statementKey` (inclusive
   * `null`), grava `userLocked.statement = true` (ADR-024): o sync automático de faturas não
   * devolve o lançamento ao ciclo original.
   * `SYSTEM`: engines e sincronizações. Se `userLocked.statement` já estiver ligado, NÃO altera
   * `statementId`/`statementKey` e os devolve em `skippedFields`; os demais vínculos do patch
   * seguem normalmente. Nada é travado.
   * Omitido: comportamento neutro (grava o patch; não trava nem respeita `userLocked`).
   */
  actor?: 'USER' | 'SYSTEM'
}

export type SetTransactionLinksResult = LedgerTxn & {
  /** Campos do patch ignorados por estarem em `userLocked` (só com `actor: 'SYSTEM'`). */
  skippedFields: string[]
}

/**
 * Altera só os vínculos de um lançamento (ex.: mover compra de cartão para outra fatura,
 * ligar a uma série, registrar a origem da categoria). Não mexe em valor/status, logo não
 * muda saldo; vale também para `RECONCILED` (são rótulos). Só o vínculo de fatura entra em
 * `userLocked` (chave `statement`) e só com `actor: 'USER'`; ver `SetTransactionLinksOptions`.
 * Cada chave presente é validada (formato, existência e dono); `null` limpa o vínculo.
 * Em perna de transferência altera só a perna informada.
 */
export async function setTransactionLinks(
  deps: LedgerDeps,
  ctx: LedgerContext,
  id: string,
  links: TxnLinksInput,
  opts: SetTransactionLinksOptions = {},
): Promise<SetTransactionLinksResult> {
  const requested = normalizeLinksPatch(links)
  if (Object.keys(requested).length === 0) {
    throw new LedgerError('LEDGER_EMPTY_PATCH', 'Nenhum vínculo informado para atualizar.')
  }
  const touchesStatement = STATEMENT_LOCKED_FIELDS.some((field) => field in requested)

  const result = await deps.repo.withTransaction(async (tx) => {
    const [locked] = await tx.lockTxns(ctx.userId, [id])
    if (!locked) throw new LedgerError('LEDGER_TXN_NOT_FOUND', 'Lançamento não encontrado.', { id })

    const patch: Partial<TxnLinks> = { ...requested }
    const skippedFields: string[] = []
    if (opts.actor === 'SYSTEM' && locked.userLocked[STATEMENT_LOCK_KEY] === true) {
      for (const field of STATEMENT_LOCKED_FIELDS) {
        if (field in patch) {
          delete patch[field]
          skippedFields.push(field)
        }
      }
      if (Object.keys(patch).length === 0) {
        return { transaction: locked, skippedFields, changed: false }
      }
    }

    await assertLinkRefs(tx, ctx.userId, patch, { id })
    const row: TxnPatch = { ...patch }
    if (opts.actor === 'USER' && touchesStatement) {
      row.userLocked = { ...locked.userLocked, [STATEMENT_LOCK_KEY]: true }
    }
    const transaction = await tx.updateTxn(ctx.userId, id, row)
    return { transaction, skippedFields, changed: true }
  })

  if (result.changed) {
    await notifyMutation(deps, {
      userId: ctx.userId,
      type: 'UPDATE',
      accountIds: [result.transaction.accountId],
      transactionIds: [result.transaction.id],
    })
  }
  return { ...result.transaction, skippedFields: result.skippedFields }
}
