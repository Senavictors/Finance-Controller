import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Teste de contrato do schema Prisma 2.0 (FC2-F0-02).
 * Lê o texto de `prisma/schema.prisma` (sem banco) e protege as decisões-chave:
 * idempotência, pares de transferência, dinheiro em centavos Int, datas ao meio-dia UTC,
 * índices por userId e valores exatos dos enums.
 */

const schema = readFileSync(join(__dirname, 'schema.prisma'), 'utf8')

type Field = { name: string; type: string; optional: boolean; list: boolean; raw: string }
type Model = { name: string; fields: Field[]; attributes: string[]; raw: string }

function stripComment(line: string): string {
  return line.replace(/\/\/.*$/, '').trim()
}

function parseModels(source: string): Model[] {
  const models: Model[] = []
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  for (const match of source.matchAll(re)) {
    const [, name, body] = match
    const fields: Field[] = []
    const attributes: string[] = []
    for (const rawLine of body.split(/\r?\n/)) {
      const line = stripComment(rawLine)
      if (!line) continue
      if (line.startsWith('@@')) {
        attributes.push(line)
        continue
      }
      const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/)
      if (m) {
        fields.push({
          name: m[1],
          type: m[2],
          list: Boolean(m[3]),
          optional: Boolean(m[4]),
          raw: line,
        })
      }
    }
    models.push({ name, fields, attributes, raw: body })
  }
  return models
}

function parseEnums(source: string): Record<string, string[]> {
  const enums: Record<string, string[]> = {}
  const re = /^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  for (const match of source.matchAll(re)) {
    const [, name, body] = match
    enums[name] = body
      .split(/\r?\n/)
      .map(stripComment)
      .filter((l) => l && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/)[0])
  }
  return enums
}

const models = parseModels(schema)
const enums = parseEnums(schema)
const modelNames = new Set(models.map((m) => m.name))
const byName = (name: string): Model => {
  const model = models.find((m) => m.name === name)
  if (!model) throw new Error(`Modelo ${name} não encontrado`)
  return model
}

const MONEY_FIELD = /(amount|cents|limit|balance|cushion|microusd)/i
const NON_MONEY_FIELDS = new Set([
  'amountTolerancePct', // percentual inteiro, não valor monetário
  'aiConfidence',
])

describe('schema Prisma 2.0: modelos', () => {
  it('declara todos os modelos centrais', () => {
    const names = models.map((m) => m.name)
    for (const expected of [
      'User',
      'Session',
      'LoginAttempt',
      'UserSettings',
      'Account',
      'AccountBalance',
      'Reconciliation',
      'Category',
      'Merchant',
      'Transaction',
      'RecurringSeries',
      'IncomeRule',
      'MeiProfile',
      'MeiLedger',
      'Loan',
      'LoanInstallment',
      'CreditCardStatement',
      'CardPurchase',
      'CardInstallment',
      'CardInstallmentAdvance',
      'BudgetCycle',
      'BudgetLine',
      'Rule',
      'ImportBatch',
      'Goal',
      'Memory',
      'AgentRun',
      'AiUsage',
      'TelegramLink',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('Session guarda o hash do token, nunca o token em claro', () => {
    const session = byName('Session')
    expect(session.fields.map((f) => f.name)).toContain('tokenHash')
    expect(session.fields.map((f) => f.name)).not.toContain('token')
  })

  it('User não tem coluna de imagem', () => {
    expect(byName('User').fields.map((f) => f.name)).not.toContain('image')
  })
})

describe('schema Prisma 2.0: idempotência e pares (Transaction)', () => {
  const tx = byName('Transaction')

  it('tem @@unique([userId, importHash])', () => {
    expect(tx.attributes).toContain('@@unique([userId, importHash])')
  })

  it('tem @@unique([userId, occurrenceKey])', () => {
    expect(tx.attributes).toContain('@@unique([userId, occurrenceKey])')
  })

  it('tem @@unique([transferId, accountId])', () => {
    expect(tx.attributes).toContain('@@unique([transferId, accountId])')
  })

  it('amount é Int obrigatório (assinado, centavos)', () => {
    const amount = tx.fields.find((f) => f.name === 'amount')
    expect(amount?.type).toBe('Int')
    expect(amount?.optional).toBe(false)
  })

  it('refundOfId existe para estornos', () => {
    expect(tx.fields.map((f) => f.name)).toContain('refundOfId')
  })
})

describe('schema Prisma 2.0: dinheiro e tempo', () => {
  it('todo campo monetário é Int (centavos)', () => {
    const offenders: string[] = []
    for (const model of models) {
      for (const field of model.fields) {
        if (NON_MONEY_FIELDS.has(field.name)) continue
        if (modelNames.has(field.type)) continue // campo de relação, não coluna
        if (MONEY_FIELD.test(field.name) && field.type !== 'Int') {
          offenders.push(`${model.name}.${field.name}: ${field.type}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('não usa Float', () => {
    expect(schema).not.toMatch(/\bFloat\b/)
  })

  it('não usa @db.Date (datas de calendário ficam em meio-dia UTC)', () => {
    expect(schema).not.toMatch(/@db\.Date\b/)
  })

  it('só três colunas Decimal, todas taxas/percentuais de Loan', () => {
    const decimals: string[] = []
    for (const model of models) {
      for (const field of model.fields) {
        if (field.type === 'Decimal') decimals.push(`${model.name}.${field.name}`)
      }
    }
    expect(decimals.sort()).toEqual([
      'Loan.lateFeePct',
      'Loan.lateInterestMonthlyPct',
      'Loan.monthlyRate',
    ])
  })
})

describe('schema Prisma 2.0: isolamento por userId', () => {
  // Modelos sem userId por design: User (raiz), LoginAttempt (anterior à identificação do
  // usuário) e filhos escopados pela FK do pai (Loan, CardPurchase, BudgetCycle).
  const WITHOUT_USER_ID = new Set([
    'User',
    'LoginAttempt',
    'LoanInstallment',
    'CardInstallment',
    'BudgetLine',
  ])

  function hasUserIdLeadingIndex(model: Model): boolean {
    const fromAttributes = model.attributes.some((a) =>
      /^@@(index|unique)\(\[userId[,\]\s(]/.test(a),
    )
    const fromField = model.fields.some((f) => f.name === 'userId' && /@unique\b/.test(f.raw))
    return fromAttributes || fromField
  }

  it('todo modelo com userId tem índice ou unique começando por userId', () => {
    const offenders = models
      .filter((m) => m.fields.some((f) => f.name === 'userId'))
      .filter((m) => !hasUserIdLeadingIndex(m))
      .map((m) => m.name)
    expect(offenders).toEqual([])
  })

  it('a lista de modelos sem userId é exatamente a de exceções explícitas', () => {
    const withoutUserId = models
      .filter((m) => !m.fields.some((f) => f.name === 'userId'))
      .map((m) => m.name)
      .sort()
    expect(withoutUserId).toEqual([...WITHOUT_USER_ID].sort())
  })

  it('todo userId tem FK para User com onDelete Cascade', () => {
    for (const model of models) {
      if (!model.fields.some((f) => f.name === 'userId')) continue
      expect(model.raw, model.name).toMatch(
        /@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/,
      )
    }
  })
})

describe('schema Prisma 2.0: enums obrigatórios', () => {
  const expected: Record<string, string[]> = {
    AccountType: ['CHECKING', 'SAVINGS', 'WALLET', 'INVESTMENT', 'CREDIT_CARD', 'BUSINESS'],
    CategoryType: ['INCOME', 'EXPENSE'],
    Nature: ['MUST', 'NEED', 'WANT'],
    TxnKind: ['EXPENSE', 'INCOME', 'TRANSFER', 'CARD_PAYMENT', 'FEE', 'INTEREST', 'ADJUSTMENT'],
    TxnStatus: ['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED'],
    ReviewState: ['NEEDS_REVIEW', 'REVIEWED'],
    TxnSource: ['MANUAL', 'QUICKADD', 'IMPORT', 'BOT', 'RECURRING', 'OPEN_FINANCE'],
    CategorySource: ['USER', 'RULE', 'MERCHANT', 'LLM', 'PARSER', 'IMPORT'],
    SeriesKind: ['BILL', 'SUBSCRIPTION', 'INCOME', 'TRANSFER', 'LOAN_INSTALLMENT', 'TAX'],
    LoanKind: [
      'CONSIGNADO',
      'PERSONAL',
      'OVERDRAFT',
      'CARD_REVOLVING',
      'CARD_REFINANCE',
      'PIX_CREDIT',
    ],
    LoanSystem: ['PRICE'],
    LoanStatus: ['ACTIVE', 'PAID_OFF', 'DEFAULTED'],
    InstallmentStatus: ['PENDING', 'PAID', 'SKIPPED'],
    StatementStatus: ['OPEN', 'CLOSED', 'PAID', 'OVERDUE'],
    BudgetBucket: ['FIXED', 'NON_MONTHLY', 'FLEX'],
    RuleStage: ['PRE', 'DEFAULT', 'POST'],
    RuleOrigin: ['USER', 'LEARNED'],
    ImportKind: [
      'OFX',
      'CSV',
      'PDF_ITAU_EXTRATO',
      'PDF_ITAU_FATURA',
      'PDF_NUBANK_EXTRATO',
      'PDF_NUBANK_FATURA',
    ],
    ImportStatus: ['PENDING', 'PROCESSED', 'FAILED', 'UNDONE'],
    GoalKind: ['RESERVE', 'PRIORITY', 'WISH', 'DEBT_PAYOFF'],
    GoalStatus: ['ACTIVE', 'DONE', 'ARCHIVED'],
    ReconStatus: ['MATCHED', 'ADJUSTED', 'UNDONE'],
    CycleMode: ['CALENDAR_MONTH', 'INCOME_CYCLE'],
    BusinessDayRule: ['NONE', 'NEXT_BUSINESS_DAY', 'PREVIOUS_BUSINESS_DAY'],
    AdditionalBasis: ['PREVIOUS_MONTH', 'SAME_MONTH'],
    AgentRunStatus: ['RUNNING', 'OK', 'FAILED'],
  }

  it.each(Object.entries(expected))('%s tem os valores exatos', (name, values) => {
    expect(enums[name]).toEqual(values)
  })

  it('não existem enums além dos esperados', () => {
    expect(Object.keys(enums).sort()).toEqual(Object.keys(expected).sort())
  })

  it('todo enum tem @@map em snake_case', () => {
    const re = /^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm
    for (const match of schema.matchAll(re)) {
      expect(match[2], match[1]).toMatch(/@@map\("[a-z_]+"\)/)
    }
  })
})
