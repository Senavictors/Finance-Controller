import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findLedgerWriteViolations,
  isLedgerWriteAllowed,
  mentionsPrisma,
} from './ledger-boundaries'

const ROOT = resolve(__dirname, '..', '..')
const SOURCE_FILE = /\.(?:ts|tsx|mts|js|mjs)$/
const SKIPPED_DIRS = new Set(['node_modules', 'generated', '.next', 'migrations'])

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : walk(full)
    return SOURCE_FILE.test(name) ? [full] : []
  })
}

const rel = (file: string) => relative(ROOT, file).replace(/\\/g, '/')

describe('detector de escritas no ledger', () => {
  it.each([
    'await prisma.transaction.create({ data })',
    'await tx.transaction.updateMany({ where, data })',
    'this.db.accountBalance.upsert({ where, create, update })',
    'await db.transaction.deleteMany({ where })',
    'await prisma.$executeRaw`UPDATE account_balances SET balance_cleared = 0`',
    'await prisma.$executeRawUnsafe(\'INSERT INTO "transactions" (id) VALUES (1)\')',
    'data: { name, transactions: { create: [{ amount: 1 }] } }',
  ])('acusa: %s', (code) => {
    expect(findLedgerWriteViolations(code).length).toBeGreaterThan(0)
  })

  it.each([
    'const rows = await prisma.transaction.findMany({ where })',
    'const total = await prisma.transaction.groupBy({ by: ["status"] })',
    'const n = await db.transaction.count()',
    'await prisma.$transaction(async (tx) => {})',
    'await prisma.account.update({ where, data })',
    '// prisma.transaction.create nunca fora do ledger',
    ' * tx.transaction.delete(...) é proibido',
  ])('não acusa leitura, $transaction ou comentário: %s', (code) => {
    expect(findLedgerWriteViolations(code)).toEqual([])
  })
})

describe('ledger: fronteiras (ADR-019 / ADR-025)', () => {
  it('só ledger/infra escreve em transactions e account_balances', () => {
    const files = ['src', 'scripts', 'prisma'].flatMap((dir) => walk(join(ROOT, dir)))
    const offenders = files
      .filter((file) => !isLedgerWriteAllowed(rel(file)))
      .flatMap((file) =>
        findLedgerWriteViolations(readFileSync(file, 'utf8')).map(
          (v) => `${rel(file)}:${v.line} [${v.rule}] ${v.excerpt}`,
        ),
      )
    expect(offenders, `Escritas no ledger fora de ledger/infra:\n${offenders.join('\n')}`).toEqual(
      [],
    )
  })

  it('ledger/domain é puro: nenhuma menção a Prisma', () => {
    const files = walk(join(ROOT, 'src/server/modules/ledger/domain'))
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter((file) => mentionsPrisma(readFileSync(file, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('ledger/domain não importa application, infra, http, next nem módulos de servidor', () => {
    const files = walk(join(ROOT, 'src/server/modules/ledger/domain'))
    const forbidden =
      /from\s+['"](?:\.\.\/(?:application|infra|http)|@\/server|@\/app|next|@prisma)/
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('route handlers do ledger não usam Prisma diretamente', () => {
    const files = [
      ...walk(join(ROOT, 'src/app/api/transactions')),
      ...walk(join(ROOT, 'src/app/api/transfers')),
    ]
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter((file) => mentionsPrisma(readFileSync(file, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })
})
