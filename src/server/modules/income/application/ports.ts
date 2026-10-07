import type { LedgerService, TransactionHandle } from '@/server/modules/ledger'
import type { AttendanceOverrides, BusinessDayRule } from '../domain/calendar'
import type { AdditionalBasis } from '../domain/income-rule'

/** Registro de `IncomeRule` como o módulo o enxerga (independente do Prisma). */
export interface IncomeRuleRecord {
  id: string
  userId: string
  name: string
  baseCents: number
  perDayCents: number
  weekdays: number[]
  payDay: number
  paymentAdjust: BusinessDayRule
  additionalBasis: AdditionalBasis
  destinationAccountId: string
  extraDaysOff: string[]
  attendanceOverrides: Record<string, boolean>
  /** Meio-dia UTC. */
  startDate: Date
  endDate: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type NewIncomeRule = Omit<IncomeRuleRecord, 'createdAt' | 'updatedAt'>

export type IncomeRulePatch = Partial<
  Pick<
    IncomeRuleRecord,
    | 'name'
    | 'baseCents'
    | 'perDayCents'
    | 'weekdays'
    | 'payDay'
    | 'paymentAdjust'
    | 'additionalBasis'
    | 'destinationAccountId'
    | 'extraDaysOff'
    | 'attendanceOverrides'
    | 'startDate'
    | 'endDate'
    | 'isActive'
  >
>

export interface MeiProfileRecord {
  id: string
  userId: string
  openedAt: Date | null
  annualCeilingCents: number
  dasAmountCents: number
  dasDueDay: number
  dasAccountId: string | null
  businessAccountId: string | null
  createdAt: Date
  updatedAt: Date
}

export type MeiProfileData = Omit<MeiProfileRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

export interface MeiLedgerRecord {
  userId: string
  year: number
  accumulatedCents: number
  proportionalCeilingCents: number
  /** 12 valores (janeiro a dezembro), centavos. */
  byMonth: number[]
  lastRecomputedAt: Date
}

/** Conta como o módulo precisa dela (o CRUD é da F1-02). */
export interface IncomeAccountRef {
  id: string
  userId: string
  type: string
  isArchived: boolean
}

/**
 * Porta de persistência do módulo. Toda operação é escopada por `userId` (isolamento). As
 * escritas e leituras com lock recebem o handle da unit of work do ledger (`tx`) para entrar na
 * mesma transação; nunca escrevem em `transactions`/`account_balances` (só o ledger).
 */
export interface IncomeRepository {
  findAccount(userId: string, accountId: string): Promise<IncomeAccountRef | null>
  /** Contas `BUSINESS` do usuário, inclusive arquivadas (histórico conta no faturamento). */
  listBusinessAccountIds(userId: string): Promise<string[]>
  /** Id da categoria (`renda-mei`, `das-mei`) do usuário pela chave estável, ou `null`. */
  resolveCategoryId(userId: string, key: string): Promise<string | null>

  listRules(userId: string, opts?: { activeOnly?: boolean }): Promise<IncomeRuleRecord[]>
  findRule(userId: string, id: string): Promise<IncomeRuleRecord | null>
  /**
   * Trava (`SELECT ... FOR UPDATE`) e devolve as regras do usuário (as ativas, ou só `ruleId`),
   * em ordem de id. Os use-cases travam as regras ANTES de chamar o ledger e na mesma ordem.
   */
  lockRules(
    userId: string,
    opts: { ruleId?: string; activeOnly?: boolean },
    tx: TransactionHandle,
  ): Promise<IncomeRuleRecord[]>
  insertRule(rule: NewIncomeRule, tx: TransactionHandle): Promise<IncomeRuleRecord>
  updateRule(
    userId: string,
    id: string,
    patch: IncomeRulePatch,
    tx: TransactionHandle,
  ): Promise<IncomeRuleRecord>

  findProfile(userId: string): Promise<MeiProfileRecord | null>
  /** Trava a linha do perfil (serializa recálculos do `MeiLedger`); `null` se não existir. */
  lockProfile(userId: string, tx: TransactionHandle): Promise<MeiProfileRecord | null>
  upsertProfile(
    userId: string,
    id: string,
    data: MeiProfileData,
    tx: TransactionHandle,
  ): Promise<MeiProfileRecord>

  findMeiLedger(userId: string, year: number): Promise<MeiLedgerRecord | null>
  upsertMeiLedger(record: MeiLedgerRecord, tx: TransactionHandle): Promise<MeiLedgerRecord>
}

export interface IncomeDeps {
  repo: IncomeRepository
  /** Serviço do ledger (Prisma real ou em memória nos testes). Única porta para lançamentos. */
  ledger: LedgerService
  /** Relógio injetável; a data de negócio sai de `calendarDateInZone(now, 'America/Sao_Paulo')`. */
  clock: () => Date
  /** Gera ids (uuid) fora da `fn` da unit of work, para o retry reproduzir as mesmas chaves. */
  newId: () => string
}

export interface IncomeContext {
  userId: string
}

/** Aviso não bloqueante devolvido ao chamador. */
export interface IncomeWarning {
  code: 'INCOME_ACCOUNT_NOT_BUSINESS' | 'CATEGORY_NOT_FOUND' | 'DAS_ACCOUNT_NOT_SET'
  message: string
}

export type { AttendanceOverrides }
