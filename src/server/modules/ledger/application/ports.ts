import type { LinkRefs } from '../domain/links'
import type {
  AccountKind,
  Buckets,
  LedgerTxn,
  NewLedgerTxn,
  TxnKind,
  TxnLinks,
  TxnStatus,
} from '../domain/types'

/**
 * Handle opaco do cliente transacional (o `Prisma.TransactionClient` da transação aberta pelo
 * ledger, ou o undo log em memória). Serve para um repositório de OUTRO módulo escrever as
 * próprias tabelas na mesma transação do ledger. Não leia campos dele: use `prismaClientOf`
 * (Prisma) ou `memoryTxOf` (testes), exportados por `@/server/modules/ledger`. Escrever em
 * `transactions`/`account_balances` por ele é proibido (guard `ledger-boundaries`).
 */
export interface TransactionHandle {
  readonly backend: 'prisma' | 'memory'
}

/** Conta como o ledger a enxerga (o CRUD de contas é da FC2-F1-02). */
export interface LedgerAccount {
  id: string
  userId: string
  type: AccountKind
  isArchived: boolean
  /** Cheque especial, centavos (>= 0). */
  overdraftLimit: number
  /** Só `CREDIT_CARD`. */
  creditLimit: number | null
}

/** Linha do cache `AccountBalance` (ADR-019). */
export interface BalanceRow {
  accountId: string
  userId: string
  balanceCleared: number
  balancePending: number
  balancePlanned: number
  version: number
}

export interface TxnListFilter {
  /** Inclusivo, meio-dia UTC. */
  from?: Date
  /** Inclusivo, meio-dia UTC. */
  to?: Date
  accountId?: string
  /**
   * Um status ou vários (`IN`). Array vazio não casa com nenhum lançamento (semântica de `IN ()`).
   */
  status?: TxnStatus | readonly TxnStatus[]
  /** Lançamentos de uma categoria. */
  categoryId?: string
  /**
   * Chaves de idempotência que começam com o prefixo (ex.: `<seriesId>:`). Parametrizado:
   * `%` e `_` no prefixo valem como texto literal. O escopo por `userId` usa o índice único
   * `(userId, occurrenceKey)`.
   */
  occurrenceKeyPrefix?: string
  /** Busca textual (descrição), sem diferenciar maiúsculas. */
  q?: string
  /** Lançamentos de uma fatura. */
  statementId?: string
  /** Lançamentos de uma série recorrente. */
  seriesId?: string
  /** Estornos de um lançamento. */
  refundOfId?: string
  kind?: TxnKind
  /** Id do último item da página anterior. */
  cursor?: string
  limit: number
}

export interface TxnPage {
  items: LedgerTxn[]
  nextCursor: string | null
}

/** Campos de um lançamento que o repositório sabe atualizar. */
export type TxnPatch = Partial<TxnLinks> &
  Partial<
    Pick<
      LedgerTxn,
      | 'accountId'
      | 'categoryId'
      | 'merchantId'
      | 'kind'
      | 'status'
      | 'amount'
      | 'date'
      | 'postedDate'
      | 'description'
      | 'notes'
      | 'tags'
      | 'excludeFromBudget'
      | 'userLocked'
      | 'review'
    >
  >

/** Leituras (dentro ou fora de transação). Todas filtram por `userId` (RN-08). */
export interface LedgerReader {
  findAccount(userId: string, accountId: string): Promise<LedgerAccount | null>
  listAccounts(userId: string, opts?: { includeArchived?: boolean }): Promise<LedgerAccount[]>
  findBalance(userId: string, accountId: string): Promise<BalanceRow | null>
  listBalances(userId: string): Promise<BalanceRow[]>
  findTxn(userId: string, id: string): Promise<LedgerTxn | null>
  /** Pernas de um par (`transferId`), de qualquer conta do usuário. */
  findTransferLegs(userId: string, transferId: string): Promise<LedgerTxn[]>
  /** Confere se categoria/merchant informados pertencem ao usuário. */
  refsExist(
    userId: string,
    refs: { categoryId?: string | null; merchantId?: string | null },
  ): Promise<{ category: boolean; merchant: boolean }>
  listTransactions(userId: string, filter: TxnListFilter): Promise<TxnPage>
  /** Lançamento pela chave de idempotência (`occurrenceKey`, única por usuário). */
  findTxnByOccurrenceKey(userId: string, occurrenceKey: string): Promise<LedgerTxn | null>
  /**
   * Confere se fatura, série e lote de importação informados pertencem ao usuário (RN-08:
   * a FK sozinha aceitaria o id de outro usuário). Vínculos `null` contam como existentes.
   */
  linkRefsExist(
    userId: string,
    refs: Pick<LinkRefs, 'statementId' | 'seriesId' | 'importBatchId'>,
  ): Promise<{ statement: boolean; series: boolean; importBatch: boolean }>
}

/**
 * Operações de escrita, só disponíveis dentro de `withTransaction`: lançamentos e
 * `AccountBalance` mudam juntos ou não mudam (RN-02). Único ponto do sistema autorizado a
 * escrever em `transactions`/`account_balances` (guard em `tests/guards`).
 */
export interface LedgerTx extends LedgerReader {
  /** Handle opaco desta transação, para repositórios de outros módulos (ver `TransactionHandle`). */
  readonly handle: TransactionHandle
  /**
   * Trava as linhas (`SELECT ... FOR UPDATE`, filtrando por `userId`) numa ordem determinística
   * do banco e devolve o estado **commitado atual** das que existem (ids apagados por outra
   * transação, ou de outro usuário, simplesmente não voltam). Todo use-case que lê um
   * lançamento para calcular delta sobre ele DEVE ler por aqui: sem lock, duas requisições
   * simultâneas sobre o mesmo id aplicariam o delta duas vezes (READ COMMITTED).
   * O lock vale até o fim da transação.
   */
  lockTxns(userId: string, ids: string[]): Promise<LedgerTxn[]>
  insertTxns(rows: NewLedgerTxn[]): Promise<LedgerTxn[]>
  updateTxn(userId: string, id: string, patch: TxnPatch): Promise<LedgerTxn>
  /** Devolve quantas linhas foram apagadas; quem chama confere contra `ids.length`. */
  deleteTxns(userId: string, ids: string[]): Promise<number>
  /**
   * Incremento atômico do cache (nunca ler-somar-gravar): cria a linha se faltar, soma os
   * deltas e incrementa `version`. Também serve para travar a linha (delta zero).
   */
  incrementBalance(userId: string, accountId: string, delta: Buckets): Promise<BalanceRow>
  /** Substitui os três baldes (reconstrução). Não altera `version`. */
  setBalance(userId: string, accountId: string, buckets: Buckets): Promise<BalanceRow>
  /**
   * Garante a linha de `AccountBalance` da conta (zerada se não existir), sem alterar uma linha
   * existente. Idempotente e seguro sob concorrência (`INSERT ... ON CONFLICT DO NOTHING`).
   */
  ensureBalance(userId: string, accountId: string): Promise<BalanceRow>
  /**
   * Trava, em ordem crescente, as chaves de idempotência informadas (Postgres:
   * `pg_advisory_xact_lock` por `(userId, chave)`), até o fim da transação. Serializa
   * `upsertPlannedByOccurrenceKey` concorrentes na mesma chave, inclusive quando a linha ainda
   * não existe. Vem ANTES dos locks de linha na ordem global.
   */
  lockOccurrenceKeys(userId: string, occurrenceKeys: string[]): Promise<void>
  /** Soma `amount` do ledger da conta por balde (`CLEARED+RECONCILED`, `PENDING`, `PLANNED`). */
  sumByBucket(userId: string, accountId: string): Promise<Buckets>
}

export interface LedgerRepository extends LedgerReader {
  /** Executa `fn` em uma única transação de banco; qualquer erro desfaz tudo. */
  withTransaction<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T>
}

export interface LedgerMutationEvent {
  userId: string
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS' | 'TRANSFER' | 'REBUILD'
  accountIds: string[]
  transactionIds: string[]
  at: Date
}

/** Dependências injetadas em todo use-case (teste determinístico, ADR-025). */
export interface LedgerDeps {
  repo: LedgerRepository
  clock: () => Date
  /** UUID v4 (`transferId`). */
  uuid: () => string
  /**
   * Hook `afterLedgerMutation`: no-op nesta task; F3 plugará invalidação de projeções.
   * Roda depois do commit; falha aqui não desfaz a mutação.
   */
  afterLedgerMutation?: (event: LedgerMutationEvent) => void | Promise<void>
}

export interface LedgerContext {
  userId: string
}
