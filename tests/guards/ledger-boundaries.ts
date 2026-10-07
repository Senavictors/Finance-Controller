/**
 * Fronteiras do ledger (ADR-019, ADR-025; FC2-F1-01).
 *
 * 1. Só `src/server/modules/ledger/infra/` escreve em `transactions`/`account_balances`:
 *    qualquer outra escrita deixaria o cache `AccountBalance` divergir do ledger.
 * 2. `src/server/modules/ledger/domain/` é puro: nenhuma menção a Prisma.
 *
 * Preferido a uma regra ESLint `no-restricted-syntax` por não alterar `eslint.config.mjs` e por
 * cobrir também SQL cru (`$executeRaw`) e escritas aninhadas.
 */

/** Métodos de escrita do Prisma Client. */
const WRITE_METHODS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
].join('|')

export interface LedgerWriteViolation {
  rule: 'prisma-model-write' | 'raw-sql-write' | 'nested-write'
  line: number
  excerpt: string
}

const RULES: ReadonlyArray<{ rule: LedgerWriteViolation['rule']; pattern: RegExp }> = [
  {
    // prisma.transaction.create(...), tx.accountBalance.update(...), this.db.transaction.deleteMany(...)
    rule: 'prisma-model-write',
    pattern: new RegExp(`\\.(?:transaction|accountBalance)\\.(?:${WRITE_METHODS})\\b`),
  },
  {
    rule: 'raw-sql-write',
    pattern:
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+"?(?:transactions|account_balances)"?/i,
  },
  {
    // account.create({ data: { transactions: { create: [...] } } }) e variantes
    rule: 'nested-write',
    pattern: new RegExp(
      `\\b(?:transactions|accountBalance|balance)\\s*:\\s*\\{\\s*(?:${WRITE_METHODS}|connect|set)\\b`,
    ),
  },
]

/** Procura escritas no ledger em um trecho de código (linhas de comentário `//` são ignoradas). */
export function findLedgerWriteViolations(source: string): LedgerWriteViolation[] {
  const violations: LedgerWriteViolation[] = []
  source.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return
    for (const { rule, pattern } of RULES) {
      if (pattern.test(line)) {
        violations.push({ rule, line: index + 1, excerpt: line.trim().slice(0, 120) })
      }
    }
  })
  return violations
}

/** Caminhos (relativos à raiz, com `/`) autorizados a escrever no ledger. */
export const LEDGER_WRITE_ALLOWED_PREFIXES: readonly string[] = ['src/server/modules/ledger/infra/']

export function isLedgerWriteAllowed(relativePath: string): boolean {
  return LEDGER_WRITE_ALLOWED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
}

export function mentionsPrisma(source: string): boolean {
  return /prisma/i.test(source)
}
