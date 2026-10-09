import type { LedgerService, LedgerWarning, TransactionHandle } from '@/server/modules/ledger'

import type { AccountRecord, NormalizedAccountFields } from '../domain/types'

/** Conta a inserir (o repositório grava `isArchived = false`). */
export type NewAccountRecord = NormalizedAccountFields & {
  id: string
  userId: string
  sortOrder: number
}

/** Campos graváveis de uma conta existente. */
export type AccountUpdate = Partial<Omit<AccountRecord, 'id' | 'userId'>>

/**
 * Porta de persistência de contas. Toda consulta filtra por `userId` (RN-08). O parâmetro `tx`
 * é o handle da unit of work do ledger (`uow.tx`): com ele a escrita entra na MESMA transação
 * do ledger (ADR-019); sem ele, o repositório usa o próprio cliente.
 *
 * Não existe leitura nem escrita de saldo aqui: o saldo é do ledger.
 */
export interface AccountRepository {
  /** Todas as contas do usuário (inclusive arquivadas), por `sortOrder` e nome. */
  listByUser(userId: string, tx?: TransactionHandle): Promise<AccountRecord[]>
  findById(userId: string, id: string, tx?: TransactionHandle): Promise<AccountRecord | null>
  /** Lança `AccountError('ACCOUNT_NAME_TAKEN')` se o banco recusar o nome duplicado. */
  insert(row: NewAccountRecord, tx?: TransactionHandle): Promise<AccountRecord>
  /** `null` se a conta não existir (ou for de outro usuário). */
  update(
    userId: string,
    id: string,
    patch: AccountUpdate,
    tx?: TransactionHandle,
  ): Promise<AccountRecord | null>
  /**
   * Remove a conta (o `AccountBalance` cai em cascata no banco). Lança
   * `AccountError('ACCOUNT_IN_USE')` se outra tabela ainda referenciar a conta.
   */
  delete(userId: string, id: string, tx?: TransactionHandle): Promise<void>
  /** Grava `sortOrder` = posição na lista, na ordem dada. */
  setSortOrders(userId: string, orderedIds: string[], tx?: TransactionHandle): Promise<void>
  /** Próximo `sortOrder` livre (máximo atual + 1). */
  nextSortOrder(userId: string, tx?: TransactionHandle): Promise<number>
}

/** O que contas consome do ledger (API pública `@/server/modules/ledger`). */
export type AccountsLedger = Pick<
  LedgerService,
  'runInTransaction' | 'listAccountPositions' | 'getAccountPosition' | 'listTransactions'
>

/** Dependências injetadas em todo use-case (teste determinístico, ADR-025). */
export interface AccountDeps {
  accounts: AccountRepository
  ledger: AccountsLedger
  clock: () => Date
  /** Id novo (gerado ANTES da unit of work, para a nova tentativa reproduzir a mesma chave). */
  newId: () => string
}

export type AccountWarning =
  | 'ARCHIVED_WITH_BALANCE'
  | 'STATEMENT_DAYS_CHANGED'
  | LedgerWarning['code']
