import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Teste de contrato da migration inicial e das convenções do schema (FC2-F0-02, revisão QA).
 * Lê texto de `prisma/migrations/*_init_fc2/migration.sql` e de `prisma/schema.prisma`; sem banco.
 * Complementa `schema.contract.test.ts` (CA-02, CA-03, CA-07 e convenções de nomes/onDelete).
 */

const root = join(__dirname, '..')
const migrationsDir = join(__dirname, 'migrations')
const schema = readFileSync(join(__dirname, 'schema.prisma'), 'utf8')

const initFolder = readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_/.test(name))
  .sort()[0]
const sql = readFileSync(join(migrationsDir, initFolder, 'migration.sql'), 'utf8')

describe('migration inicial', () => {
  it('a primeira migration é a init_fc2 e o migration_lock.toml existe', () => {
    expect(initFolder).toMatch(/^\d{14}_init_fc2$/)
    expect(existsSync(join(migrationsDir, 'migration_lock.toml'))).toBe(true)
    expect(readFileSync(join(migrationsDir, 'migration_lock.toml'), 'utf8')).toMatch(
      /provider = "postgresql"/,
    )
  })

  it.each([
    ['transactions_amount_nonzero', '"amount" <> 0'],
    ['transactions_pair_requires_transfer_id', `'TRANSFER','CARD_PAYMENT'`],
    ['accounts_overdraft_nonneg', '"overdraft_limit" >= 0'],
    ['accounts_days_range', '"closing_day" BETWEEN 1 AND 31'],
    ['income_rules_pay_day_range', '"pay_day" BETWEEN 1 AND 31'],
  ])('tem a CHECK %s', (name, fragment) => {
    const start = sql.indexOf(`ADD CONSTRAINT "${name}"`)
    expect(start, `constraint ${name} ausente`).toBeGreaterThan(-1)
    const statement = sql.slice(start, sql.indexOf(';', start))
    expect(statement).toContain('CHECK')
    expect(statement).toContain(fragment)
  })

  it('accounts_days_range cobre closing_day e due_day', () => {
    const start = sql.indexOf('ADD CONSTRAINT "accounts_days_range"')
    const statement = sql.slice(start, sql.indexOf(';', start))
    expect(statement).toContain('"due_day" BETWEEN 1 AND 31')
  })

  it('cria os uniques de idempotência e de pares da Transaction', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "transactions_user_id_import_hash_key" ON "transactions"\("user_id", "import_hash"\)/,
    )
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "transactions_user_id_occurrence_key_key" ON "transactions"\("user_id", "occurrence_key"\)/,
    )
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "transactions_transfer_id_account_id_key" ON "transactions"\("transfer_id", "account_id"\)/,
    )
  })

  it('o DDL não usa DOUBLE PRECISION nem DATE; DECIMAL só nas 3 taxas', () => {
    expect(sql).not.toMatch(/DOUBLE PRECISION/)
    expect(sql).not.toMatch(/\bDATE\b/)
    const decimals = sql.match(/DECIMAL\(\d+,\d+\)/g) ?? []
    expect(decimals.sort()).toEqual(['DECIMAL(5,2)', 'DECIMAL(5,2)', 'DECIMAL(9,6)'])
  })

  it('não cria schema nem apaga objetos (portável para Neon sem privilégio extra)', () => {
    expect(sql).not.toMatch(/CREATE SCHEMA/i)
    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
  })

  it('cria uma tabela por modelo do schema', () => {
    const models = [...schema.matchAll(/^model\s+\w+\s*\{[\s\S]*?^\}/gm)].map((m) => m[0])
    expect(models.length).toBeGreaterThanOrEqual(29)
    for (const body of models) {
      const table = body.match(/@@map\("(\w+)"\)/)?.[1]
      expect(table, 'modelo sem @@map').toBeTruthy()
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    }
  })
})

describe('sem seed (CA-07)', () => {
  it('package.json e prisma.config.ts não definem seed e não há arquivo de seed', () => {
    expect(readFileSync(join(root, 'package.json'), 'utf8')).not.toMatch(/seed/i)
    expect(readFileSync(join(root, 'prisma.config.ts'), 'utf8')).not.toMatch(/seed/i)
    expect(readdirSync(__dirname).filter((n) => /^seed/i.test(n))).toEqual([])
  })
})

describe('convenções do schema: nomes, onDelete e dinheiro fora do regex padrão', () => {
  const scalarTypes = new Set(['String', 'Int', 'Boolean', 'DateTime', 'Json', 'Decimal'])
  const enumNames = new Set([...schema.matchAll(/^enum\s+(\w+)/gm)].map((m) => m[1]))
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => ({
    name: m[1],
    body: m[2],
  }))

  it('todo modelo tem @@map snake_case plural-like e toda coluna camelCase tem @map', () => {
    const offenders: string[] = []
    for (const { name, body } of models) {
      if (!/@@map\("[a-z][a-z0-9_]*"\)/.test(body)) offenders.push(`${name}: sem @@map snake_case`)
      for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.replace(/\/\/.*$/, '').trim()
        const m = line.match(/^([a-z]\w*)\s+(\w+)(\[\])?\??/)
        if (!m) continue
        const [, field, type] = m
        if (!scalarTypes.has(type) && !enumNames.has(type)) continue // relação
        if (/[A-Z]/.test(field) && !/@map\("[a-z][a-z0-9_]*"\)/.test(line)) {
          offenders.push(`${name}.${field}: sem @map`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('toda relação com FK declara onDelete explícito', () => {
    const offenders: string[] = []
    for (const { name, body } of models) {
      for (const line of body.split(/\r?\n/)) {
        if (/@relation\(.*fields:/.test(line) && !/onDelete:/.test(line)) {
          offenders.push(`${name}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it.each([
    ['Transaction', 'statement', 'SetNull'],
    ['Transaction', 'category', 'SetNull'],
    ['Transaction', 'merchant', 'SetNull'],
    ['Transaction', 'series', 'SetNull'],
    ['Transaction', 'importBatch', 'SetNull'],
    ['Transaction', 'account', 'Cascade'],
    ['CardInstallment', 'ledgerTransaction', 'Cascade'],
    ['AccountBalance', 'account', 'Cascade'],
    ['Category', 'parent', 'SetNull'],
  ])('%s.%s usa onDelete %s', (model, field, action) => {
    const body = models.find((m) => m.name === model)?.body ?? ''
    const line = body.split(/\r?\n/).find((l) => new RegExp(`^\\s*${field}\\s`).test(l)) ?? ''
    expect(line, `${model}.${field}`).toContain(`onDelete: ${action}`)
  })

  it('campos monetários fora do regex padrão do contrato também são Int', () => {
    const extra: Array<[string, string]> = [
      ['BudgetCycle', 'expectedIncome'],
      ['Reconciliation', 'difference'],
      ['BudgetCycle', 'cushion'],
      ['BudgetCycle', 'flexAmount'],
    ]
    for (const [model, field] of extra) {
      const body = models.find((m) => m.name === model)?.body ?? ''
      expect(body, `${model}.${field}`).toMatch(new RegExp(`^\\s*${field}\\s+Int\\??\\s`, 'm'))
    }
  })
})
