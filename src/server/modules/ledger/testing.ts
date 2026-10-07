/**
 * Utilitários de teste do ledger para outros módulos (só em `*.test.ts`/`test-helpers.ts`;
 * o guard `ledger-boundaries` barra o uso em código de produção).
 *
 * `InMemoryLedgerRepository` participa do rollback conjunto: o repositório em memória do módulo
 * consumidor registra o `undo` das próprias escritas com `onRollback(uow.tx, undo)` (de
 * `@/server/modules/ledger`). Contas criadas pelo módulo de contas devem ser visíveis ao
 * ledger: registre-as em `ledgerRepo.accounts` (e remova no `undo`).
 */
export { InMemoryLedgerRepository, type InMemoryOp } from './infra/in-memory-ledger-repository'
export {
  OTHER_USER,
  USER,
  cachedBuckets,
  day,
  expectCacheMatchesLedger,
  ledgerBuckets,
  ledgerErrorCode,
  makeLedgerEnv,
  type LedgerEnv,
} from './application/test-helpers'
