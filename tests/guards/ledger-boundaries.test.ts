import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findLedgerImportViolations,
  findLedgerWriteViolations,
  isLedgerWriteAllowed,
  mentionsPrisma,
  resolveImportTarget,
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
    // brecha do handle da unit of work: o cliente transacional não autoriza escrever no ledger
    'await prismaClientOf(uow.tx).transaction.create({ data })',
    'await db.accountBalance.createMany({ data, skipDuplicates: true })',
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

describe('detector de SQL cru em várias linhas', () => {
  it('acusa UPDATE/INSERT/DELETE em transactions/account_balances quebrados em linhas', () => {
    const code = [
      'await tx.$executeRaw`',
      '  UPDATE',
      '    account_balances SET version = 1`',
    ].join('\n')
    expect(findLedgerWriteViolations(code).map((v) => v.rule)).toEqual(['raw-sql-write'])
    expect(
      findLedgerWriteViolations(['x', 'DELETE FROM', '  "transactions"'].join('\n')).length,
    ).toBe(1)
  })

  it('não acusa SELECT nem comentário', () => {
    expect(findLedgerWriteViolations('await tx.$queryRaw`SELECT id FROM transactions`')).toEqual([])
    expect(findLedgerWriteViolations(['// UPDATE', '// transactions', ''].join('\n'))).toEqual([])
  })
})

describe('detector de imports dos internos do ledger', () => {
  const from = 'src/server/modules/accounts/application/create-account.ts'

  it.each([
    "import { createTransaction } from '@/server/modules/ledger/application/create-transaction'",
    "import { PrismaLedgerRepository } from '@/server/modules/ledger/infra/prisma-ledger-repository'",
    "import { LedgerError } from '@/server/modules/ledger/domain/types'",
    "import { x } from '../../ledger/infra/in-memory-ledger-repository'",
    "const m = await import('@/server/modules/ledger/application/ports')",
    "vi.mock('@/server/modules/ledger/infra/ledger-service')",
    "export { y } from '@/server/modules/ledger/http/dto'",
  ])('acusa: %s', (code) => {
    const found = findLedgerImportViolations(from, code)
    expect(found.map((v) => v.reason)).toEqual(['internal'])
  })

  it.each([
    "import { createLedgerService, LedgerError } from '@/server/modules/ledger'",
    "import { getLedgerService } from '@/server/modules/ledger/service'",
    "import { x } from '../../ledger'",
    "import { x } from '../../ledger/index'",
    "import { z } from 'zod'",
    "import { y } from '@/server/modules/accounts/domain/validation'",
    "// import { z } from '@/server/modules/ledger/infra/x'",
  ])('não acusa a API pública, pacotes e comentários: %s', (code) => {
    expect(findLedgerImportViolations(from, code)).toEqual([])
  })

  it('ledger/testing só em arquivos de teste', () => {
    const code = "import { makeLedgerEnv } from '@/server/modules/ledger/testing'"
    expect(findLedgerImportViolations(from, code).map((v) => v.reason)).toEqual([
      'testing-in-production',
    ])
    expect(
      findLedgerImportViolations('src/server/modules/accounts/application/x.test.ts', code),
    ).toEqual([])
    expect(
      findLedgerImportViolations('src/server/modules/accounts/application/test-helpers.ts', code),
    ).toEqual([])
  })

  it('rotas em src/app podem usar ledger/http e infra/ledger-service, mas não o resto', () => {
    const route = 'src/app/api/transactions/route.ts'
    expect(
      findLedgerImportViolations(
        route,
        [
          "import { ledgerRoute } from '@/server/modules/ledger/http/route'",
          "import { getLedgerService } from '@/server/modules/ledger/infra/ledger-service'",
        ].join('\n'),
      ),
    ).toEqual([])
    expect(
      findLedgerImportViolations(
        route,
        "import { p } from '@/server/modules/ledger/infra/prisma-ledger-repository'",
      ).length,
    ).toBe(1)
    // fora de src/app, http continua interno
    expect(
      findLedgerImportViolations(from, "import { a } from '@/server/modules/ledger/http/route'")
        .length,
    ).toBe(1)
  })

  it('o próprio módulo ledger pode importar a si mesmo', () => {
    expect(
      findLedgerImportViolations(
        'src/server/modules/ledger/application/x.ts',
        "import { y } from '../infra/concurrency'",
      ),
    ).toEqual([])
  })

  it('resolve alias e caminhos relativos', () => {
    expect(resolveImportTarget(from, '@/server/modules/ledger/infra/x')).toBe(
      'src/server/modules/ledger/infra/x',
    )
    expect(resolveImportTarget(from, '../../ledger/infra/x')).toBe(
      'src/server/modules/ledger/infra/x',
    )
    expect(resolveImportTarget(from, 'zod')).toBeNull()
  })
})

describe('ledger: fronteiras (ADR-019 / ADR-025)', () => {
  it('outros módulos usam só a API pública do ledger (index, service, testing em testes)', () => {
    const files = ['src', 'scripts'].flatMap((dir) => walk(join(ROOT, dir)))
    const offenders = files.flatMap((file) =>
      findLedgerImportViolations(rel(file), readFileSync(file, 'utf8')).map(
        (v) => `${rel(file)}:${v.line} [${v.reason}] ${v.specifier}`,
      ),
    )
    expect(offenders, `Imports de internos do ledger:\n${offenders.join('\n')}`).toEqual([])
  })

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
