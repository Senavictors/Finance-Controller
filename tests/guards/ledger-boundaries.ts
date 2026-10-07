/**
 * Fronteiras do ledger (ADR-019, ADR-025; FC2-F1-01, FC2-F1-09).
 *
 * 1. Só `src/server/modules/ledger/infra/` escreve em `transactions`/`account_balances`:
 *    qualquer outra escrita deixaria o cache `AccountBalance` divergir do ledger.
 * 2. `src/server/modules/ledger/domain/` é puro: nenhuma menção a Prisma.
 * 3. Fora do módulo, o ledger só é usado pela API pública: `ledger/index` (fábrica, unit of
 *    work, handle transacional, tipos, erros), `ledger/service` (instância Prisma) e
 *    `ledger/testing` (só em testes). `ledger/{application,infra,domain,http}` são internos.
 *    Exceção: rotas em `src/app/**` podem usar `ledger/http/*` e `ledger/infra/ledger-service`.
 *    O handle da unit of work (`prismaClientOf(uow.tx)`) não abre brecha: as regras de escrita
 *    do item 1 valem para qualquer arquivo fora de `ledger/infra`.
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

/** SQL cru que atravessa linhas (`UPDATE\n  transactions`): a regra por linha não enxerga. */
const MULTILINE_RAW_SQL =
  /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+"?(?:transactions|account_balances)"?/gi

const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/

/** Procura escritas no ledger em um trecho de código (linhas de comentário `//` são ignoradas). */
export function findLedgerWriteViolations(source: string): LedgerWriteViolation[] {
  const violations: LedgerWriteViolation[] = []
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (COMMENT_LINE.test(line)) return
    for (const { rule, pattern } of RULES) {
      if (pattern.test(line)) {
        violations.push({ rule, line: index + 1, excerpt: line.trim().slice(0, 120) })
      }
    }
  })

  const stripped = lines.map((line) => (COMMENT_LINE.test(line) ? '' : line)).join('\n')
  for (const match of stripped.matchAll(MULTILINE_RAW_SQL)) {
    if (!/\n/.test(match[0])) continue // já coberto pela regra por linha
    const line = stripped.slice(0, match.index).split('\n').length
    violations.push({
      rule: 'raw-sql-write',
      line,
      excerpt: match[0].replace(/\s+/g, ' ').slice(0, 120),
    })
  }
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

// ---- fronteira de importação (API pública) -----------------------------------------------

const LEDGER_DIR = 'src/server/modules/ledger'

export interface LedgerImportViolation {
  line: number
  specifier: string
  reason: 'internal' | 'testing-in-production'
}

/** Pontos de entrada públicos do ledger para outros módulos (relativos a `ledger/`). */
export const LEDGER_PUBLIC_ENTRYPOINTS: readonly string[] = ['', 'index', 'service', 'testing']

/** Internos que rotas de `src/app/**` podem usar (handlers finos do próprio ledger). */
const APP_ROUTE_INTERNALS: readonly RegExp[] = [/^http\//, /^infra\/ledger-service$/]

const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bvi\.(?:mock|importActual)\s*\(\s*)['"]([^'"]+)['"]/g

function normalizePosix(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** Caminho (relativo à raiz, sem extensão) alvo de um import local, ou `null` se for pacote. */
export function resolveImportTarget(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return normalizePosix(`src/${specifier.slice(2)}`)
  if (specifier.startsWith('.')) {
    const dir = fromFile.split('/').slice(0, -1).join('/')
    return normalizePosix(`${dir}/${specifier}`)
  }
  return null
}

export function isTestFile(relativePath: string): boolean {
  return /\.test\.tsx?$/.test(relativePath) || /(?:^|\/)test-helpers\.ts$/.test(relativePath)
}

/** Parte do alvo dentro de `ledger/` (`''` para a raiz do módulo) ou `null` se for de fora. */
function insideLedger(target: string): string | null {
  if (target === LEDGER_DIR) return ''
  return target.startsWith(`${LEDGER_DIR}/`) ? target.slice(LEDGER_DIR.length + 1) : null
}

/**
 * Imports de `ledger/{application,infra,domain,http}` feitos de fora do módulo (e de
 * `ledger/testing` em código que não é de teste). `relativePath` usa `/`, relativo à raiz.
 */
export function findLedgerImportViolations(
  relativePath: string,
  source: string,
): LedgerImportViolation[] {
  if (insideLedger(relativePath) !== null) return []
  const violations: LedgerImportViolation[] = []
  source.split(/\r?\n/).forEach((line, index) => {
    if (COMMENT_LINE.test(line)) return
    for (const match of line.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1]!
      const target = resolveImportTarget(relativePath, specifier)
      if (target === null) continue
      const inner = insideLedger(target)
      if (inner === null) continue
      if (!LEDGER_PUBLIC_ENTRYPOINTS.includes(inner)) {
        const allowedForRoute =
          relativePath.startsWith('src/app/') && APP_ROUTE_INTERNALS.some((p) => p.test(inner))
        if (!allowedForRoute) violations.push({ line: index + 1, specifier, reason: 'internal' })
      } else if (inner === 'testing' && !isTestFile(relativePath)) {
        violations.push({ line: index + 1, specifier, reason: 'testing-in-production' })
      }
    }
  })
  return violations
}
