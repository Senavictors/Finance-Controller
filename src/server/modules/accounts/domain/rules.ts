import type { AccountPosition } from '@/server/modules/ledger'

import { normalizeName } from './validation'
import {
  CASH_TYPES,
  OVERDRAFT_TYPES,
  type AccountFields,
  type AccountRecord,
  type AccountType,
} from './types'

/** Descrição do lançamento de saldo inicial (RN-01). */
export const OPENING_DESCRIPTION = 'Saldo inicial'

/** Fuso de negócio (ADR-002): "hoje" é sempre o dia de calendário de São Paulo. */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

/** Resumo mínimo de um lançamento para decidir o que é "saldo inicial". */
export interface TxnSummary {
  kind: string
  description: string
  excludeFromBudget: boolean
}

export function isOpeningTxn(txn: TxnSummary): boolean {
  return (
    txn.kind === 'ADJUSTMENT' && txn.description === OPENING_DESCRIPTION && txn.excludeFromBudget
  )
}

/**
 * Quantos lançamentos existem além do saldo inicial (no máximo UM lançamento conta como saldo
 * inicial; qualquer outro, inclusive outro ajuste, é movimentação). RN-04/RN-05.
 */
export function countBeyondOpening(txns: readonly TxnSummary[]): number {
  const openings = txns.filter(isOpeningTxn).length
  return txns.length - Math.min(openings, 1)
}

/** RN-05: o tipo só muda enquanto a conta não tem movimentação além do saldo inicial. */
export function canChangeType(txnCountBeyondOpening: number): boolean {
  return txnCountBeyondOpening === 0
}

/** Dia de calendário de São Paulo, ao meio-dia UTC (ADR-002). */
export function todayNoonUtc(now: Date): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return new Date(`${iso}T12:00:00.000Z`)
}

/** Alteração parcial aceita por `updateAccount` (`null` limpa o campo opcional). */
export type AccountPatch = Partial<AccountFields>

const PATCHABLE_FIELDS = [
  'name',
  'type',
  'issuerKey',
  'networkKey',
  'colorKey',
  'icon',
  'overdraftLimit',
  'creditLimit',
  'closingDay',
  'dueDay',
] as const satisfies ReadonlyArray<keyof AccountFields>

export interface MergedAccount {
  /** Estado final dos campos (para validar). */
  fields: AccountFields
  /** Só o que mudou em relação ao registro atual (para gravar). */
  changes: Partial<Omit<AccountRecord, 'id' | 'userId' | 'isArchived' | 'sortOrder'>>
  typeChanged: boolean
}

/**
 * Aplica o patch sobre a conta atual. Se o tipo mudou, os campos que não se aplicam ao novo
 * tipo e que o patch não informou são zerados (ex.: cartão -> corrente limpa limite,
 * fechamento, vencimento e bandeira); os que o novo tipo exige precisam vir no patch (a
 * validação acusa). Campos inaplicáveis informados explicitamente continuam sendo erro.
 */
export function mergeAccountPatch(current: AccountRecord, patch: AccountPatch): MergedAccount {
  const typeChanged = patch.type !== undefined && patch.type !== current.type
  const type = patch.type ?? current.type
  const has = (key: keyof AccountFields) => patch[key] !== undefined

  const fields: AccountFields = {
    name: has('name') ? (patch.name as string) : current.name,
    type,
    issuerKey: has('issuerKey') ? patch.issuerKey : current.issuerKey,
    colorKey: has('colorKey') ? patch.colorKey : current.colorKey,
    icon: has('icon') ? patch.icon : current.icon,
    networkKey: has('networkKey')
      ? patch.networkKey
      : type === 'CREDIT_CARD' && !typeChanged
        ? current.networkKey
        : null,
    overdraftLimit: has('overdraftLimit')
      ? patch.overdraftLimit
      : (OVERDRAFT_TYPES as readonly AccountType[]).includes(type)
        ? current.overdraftLimit
        : 0,
    creditLimit: has('creditLimit')
      ? patch.creditLimit
      : type === 'CREDIT_CARD' && !typeChanged
        ? current.creditLimit
        : null,
    closingDay: has('closingDay')
      ? patch.closingDay
      : type === 'CREDIT_CARD' && !typeChanged
        ? current.closingDay
        : null,
    dueDay: has('dueDay')
      ? patch.dueDay
      : type === 'CREDIT_CARD' && !typeChanged
        ? current.dueDay
        : null,
  }

  const changes: MergedAccount['changes'] = {}
  const nextName = normalizeName(fields.name)
  if (nextName !== current.name) changes.name = nextName
  if (type !== current.type) changes.type = type
  for (const key of PATCHABLE_FIELDS) {
    if (key === 'name' || key === 'type') continue
    const next = key === 'overdraftLimit' ? (fields[key] ?? 0) : (fields[key] ?? null)
    if (next !== current[key]) (changes as Record<string, unknown>)[key] = next
  }
  return { fields, changes, typeChanged }
}

/** Posição do ledger como entregue por contas (saldos por balde + uso do limite). */
export interface AccountView {
  id: string
  name: string
  type: AccountType
  issuerKey: string | null
  networkKey: string | null
  colorKey: string | null
  icon: string | null
  overdraftLimit: number
  creditLimit: number | null
  closingDay: number | null
  dueDay: number | null
  isArchived: boolean
  sortOrder: number
  balance: {
    cleared: number
    pending: number
    planned: number
    current: number
    projected: number
  }
  usage: AccountPosition['usage']
}

export function toAccountView(account: AccountRecord, position: AccountPosition): AccountView {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    issuerKey: account.issuerKey,
    networkKey: account.networkKey,
    colorKey: account.colorKey,
    icon: account.icon,
    overdraftLimit: account.overdraftLimit,
    creditLimit: account.creditLimit,
    closingDay: account.closingDay,
    dueDay: account.dueDay,
    isArchived: account.isArchived,
    sortOrder: account.sortOrder,
    balance: {
      cleared: position.balanceCleared,
      pending: position.balancePending,
      planned: position.balancePlanned,
      current: position.current,
      projected: position.projected,
    },
    usage: position.usage,
  }
}

export interface AccountTotals {
  /** Σ `current` de CHECKING, SAVINGS, WALLET e BUSINESS. */
  cash: number
  /** Σ `current` de INVESTMENT. */
  investments: number
  /** Σ da dívida atual dos cartões (`max(0, -current)` por cartão). */
  cardDebt: number
}

/**
 * Totais por tipo (somente leitura). Só contas ativas entram; `excludeBusiness` (RN-07) tira as
 * contas PJ do caixa pessoal, sem mudar nada no ledger.
 */
export function computeTotals(
  views: readonly AccountView[],
  opts: { excludeBusiness?: boolean } = {},
): AccountTotals {
  const totals: AccountTotals = { cash: 0, investments: 0, cardDebt: 0 }
  for (const view of views) {
    if (view.isArchived) continue
    if (opts.excludeBusiness && view.type === 'BUSINESS') continue
    if ((CASH_TYPES as readonly AccountType[]).includes(view.type)) {
      totals.cash += view.balance.current
    } else if (view.type === 'INVESTMENT') {
      totals.investments += view.balance.current
    } else if (view.type === 'CREDIT_CARD') {
      totals.cardDebt += Math.max(0, -view.balance.current)
    }
  }
  return totals
}
