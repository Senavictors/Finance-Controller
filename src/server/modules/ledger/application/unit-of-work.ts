import type { TxnLinksInput } from '../domain/links'
import type { AccountPosition, LedgerTxn, TxnStatus } from '../domain/types'
import { changeTransactionStatus } from './change-status'
import {
  createTransaction,
  type CreateTransactionInput,
  type CreateTransactionResult,
} from './create-transaction'
import {
  createTransfer,
  type CreateTransferInput,
  type CreateTransferResult,
} from './create-transfer'
import { deleteTransaction, type DeleteTransactionResult } from './delete-transaction'
import { getAccountPosition, type ListTransactionsInput } from './get-position'
import { openAccountBalance } from './open-account-balance'
import type {
  LedgerContext,
  LedgerDeps,
  LedgerMutationEvent,
  LedgerRepository,
  LedgerTx,
  TransactionHandle,
  TxnPage,
} from './ports'
import {
  setTransactionLinks,
  type SetTransactionLinksOptions,
  type SetTransactionLinksResult,
} from './set-links'
import type { MutationResult } from './shared'
import {
  updateTransaction,
  type UpdateTransactionInput,
  type UpdateTransactionOptions,
  type UpdateTransactionResult,
} from './update-transaction'
import {
  normalizeOccurrenceKey,
  upsertPlannedBatchInTransaction,
  upsertPlannedInTransaction,
  type UpsertPlannedInput,
  type UpsertPlannedResult,
} from './upsert-planned'

/**
 * Operações do ledger dentro de UMA transação de banco aberta por `ledger.runInTransaction`.
 * É o contrato para outros módulos (contas, cartões, renda, dívidas): tudo o que o ledger faz
 * aqui entra na mesma transação das escritas que o módulo consumidor fizer pelo `tx`, e
 * desfaz junto se qualquer coisa falhar. Cada operação mantém os locks do ledger (linhas de
 * `transactions` ordenadas, depois `account_balances` por `accountId`).
 */
export interface LedgerUnitOfWork {
  readonly ctx: LedgerContext
  /**
   * Handle opaco da transação. Repositórios de outros módulos o recebem como parâmetro
   * opcional e escrevem as próprias tabelas por ele (`prismaClientOf(tx)` no Prisma;
   * `memoryTxOf(tx).onRollback(...)` em memória). Nunca para `transactions`/`account_balances`.
   */
  readonly tx: TransactionHandle

  createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult>
  createTransfer(input: CreateTransferInput): Promise<CreateTransferResult>
  updateTransaction(
    id: string,
    input: UpdateTransactionInput,
    opts?: UpdateTransactionOptions,
  ): Promise<UpdateTransactionResult>
  deleteTransaction(id: string): Promise<DeleteTransactionResult>
  changeTransactionStatus(id: string, to: TxnStatus): Promise<MutationResult>
  /**
   * Altera só vínculos (fatura, série, origem da categoria...); não muda saldo. Com
   * `actor: 'USER'` mover a fatura grava `userLocked.statement`; com `actor: 'SYSTEM'` o vínculo
   * de fatura travado é preservado e voltam em `skippedFields`. Ver `SetTransactionLinksOptions`.
   */
  setTransactionLinks(
    id: string,
    links: TxnLinksInput,
    opts?: SetTransactionLinksOptions,
  ): Promise<SetTransactionLinksResult>
  /**
   * Trava antecipadamente as chaves (advisory lock por `(userId, chave)`, até o fim da transação).
   * Chame ANTES de qualquer outra escrita do ledger quando a mesma `fn` mistura escritas e
   * `upsertPlanned*`: mantém a ordem global de locks (advisory -> linhas -> saldo) e evita
   * deadlock com `upsertPlanned*` concorrentes. Idempotente; ordem crescente interna.
   */
  lockOccurrenceKeys(occurrenceKeys: string[]): Promise<void>
  /** Previsto idempotente por `occurrenceKey`; ver `UpsertPlannedResult`. */
  upsertPlannedByOccurrenceKey(input: UpsertPlannedInput): Promise<UpsertPlannedResult>
  /** Vários previstos, com todas as chaves travadas em ordem antes de escrever. */
  upsertPlannedBatch(inputs: UpsertPlannedInput[]): Promise<UpsertPlannedResult[]>
  /** Cria a linha zerada de `AccountBalance` (idempotente). A conta já deve existir. */
  openAccountBalance(accountId: string): Promise<AccountPosition>

  // ---- leituras (enxergam as escritas já feitas nesta transação) -------------------------
  getAccountPosition(accountId: string): Promise<AccountPosition>
  findTransaction(id: string): Promise<LedgerTxn | null>
  findTransactionByOccurrenceKey(occurrenceKey: string): Promise<LedgerTxn | null>
  findTransferLegs(transferId: string): Promise<LedgerTxn[]>
  /** Sem teto de página do serviço público: `limit` padrão 50, máximo 1000. */
  listTransactions(input?: ListTransactionsInput): Promise<TxnPage>
}

/**
 * `LedgerDeps` ligado a uma transação já aberta: `repo.withTransaction` devolve a mesma `tx`
 * (sem abrir outra) e `afterLedgerMutation` só acumula os eventos, para o disparo acontecer
 * depois do commit. Permite reaproveitar os use-cases existentes dentro da unit of work.
 */
export function bindToTransaction(
  deps: LedgerDeps,
  tx: LedgerTx,
  events: LedgerMutationEvent[],
): LedgerDeps {
  const repo: LedgerRepository = {
    findAccount: (...args) => tx.findAccount(...args),
    listAccounts: (...args) => tx.listAccounts(...args),
    findBalance: (...args) => tx.findBalance(...args),
    listBalances: (...args) => tx.listBalances(...args),
    findTxn: (...args) => tx.findTxn(...args),
    findTransferLegs: (...args) => tx.findTransferLegs(...args),
    refsExist: (...args) => tx.refsExist(...args),
    listTransactions: (...args) => tx.listTransactions(...args),
    findTxnByOccurrenceKey: (...args) => tx.findTxnByOccurrenceKey(...args),
    linkRefsExist: (...args) => tx.linkRefsExist(...args),
    withTransaction: (fn) => fn(tx),
  }
  return {
    ...deps,
    repo,
    afterLedgerMutation: (event) => {
      events.push(event)
    },
  }
}

const MAX_UOW_PAGE_SIZE = 1000

export function createUnitOfWork(
  deps: LedgerDeps,
  tx: LedgerTx,
  ctx: LedgerContext,
  events: LedgerMutationEvent[],
): LedgerUnitOfWork & { close(): void } {
  const bound = bindToTransaction(deps, tx, events)
  let closed = false
  const live = <T>(fn: () => Promise<T>): Promise<T> => {
    if (closed) {
      return Promise.reject(
        new Error('LedgerUnitOfWork usada depois do fim de runInTransaction (transação fechada).'),
      )
    }
    return fn()
  }

  return {
    ctx,
    tx: tx.handle,
    close: () => {
      closed = true
    },
    createTransaction: (input) => live(() => createTransaction(bound, ctx, input)),
    createTransfer: (input) => live(() => createTransfer(bound, ctx, input)),
    updateTransaction: (id, input, opts) =>
      live(() => updateTransaction(bound, ctx, id, input, opts)),
    deleteTransaction: (id) => live(() => deleteTransaction(bound, ctx, id)),
    changeTransactionStatus: (id, to) => live(() => changeTransactionStatus(bound, ctx, id, to)),
    setTransactionLinks: (id, links, opts) =>
      live(() => setTransactionLinks(bound, ctx, id, links, opts)),
    lockOccurrenceKeys: (keys) =>
      live(async () => tx.lockOccurrenceKeys(ctx.userId, keys.map(normalizeOccurrenceKey))),
    upsertPlannedByOccurrenceKey: (input) =>
      live(() => upsertPlannedInTransaction(bound, tx, ctx, input)),
    upsertPlannedBatch: (inputs) =>
      live(() => upsertPlannedBatchInTransaction(bound, tx, ctx, inputs)),
    openAccountBalance: (accountId) => live(() => openAccountBalance(bound, ctx, accountId)),
    getAccountPosition: (accountId) => live(() => getAccountPosition(bound, ctx, accountId)),
    findTransaction: (id) => live(() => tx.findTxn(ctx.userId, id)),
    findTransactionByOccurrenceKey: (key) => live(() => tx.findTxnByOccurrenceKey(ctx.userId, key)),
    findTransferLegs: (transferId) => live(() => tx.findTransferLegs(ctx.userId, transferId)),
    listTransactions: (input = {}) =>
      live(() =>
        tx.listTransactions(ctx.userId, {
          ...input,
          limit: Math.min(Math.max(1, Math.trunc(input.limit ?? 50)), MAX_UOW_PAGE_SIZE),
        }),
      ),
  }
}

/**
 * Executa `fn` numa única transação de banco, com as operações do ledger (`uow`) e o handle
 * opaco (`uow.tx`) para o repositório de outro módulo escrever na MESMA transação. Se `fn`
 * lançar, tudo desfaz (lançamentos, saldos e as escritas do módulo consumidor).
 *
 * ATENÇÃO (retry): em deadlock/serialização (40P01/40001/P2034) o repositório Prisma refaz
 * `fn` INTEIRA uma vez, numa transação nova. Portanto `fn` deve ser idempotente e sem efeitos
 * externos (nada de HTTP, e-mail, Telegram, escrita fora do `uow.tx`) e deve gerar ids (uuid/
 * cuid) ANTES de abrir a transação (ou de forma determinística), para que a segunda tentativa
 * reproduza as mesmas chaves. `afterLedgerMutation` dispara uma vez, depois do commit.
 */
export async function runInTransaction<T>(
  deps: LedgerDeps,
  ctx: LedgerContext,
  fn: (uow: LedgerUnitOfWork) => Promise<T>,
): Promise<T> {
  let events: LedgerMutationEvent[] = []
  const result = await deps.repo.withTransaction(async (tx) => {
    events = []
    const uow = createUnitOfWork(deps, tx, ctx, events)
    try {
      return await fn(uow)
    } finally {
      uow.close()
    }
  })

  if (deps.afterLedgerMutation) {
    for (const event of events) {
      try {
        await deps.afterLedgerMutation(event)
      } catch {
        // intencional: o ledger já foi confirmado.
      }
    }
  }
  return result
}
