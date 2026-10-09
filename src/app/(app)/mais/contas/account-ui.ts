import { formatAmountText } from '@/components/fc/lib/amount'
import type { AccountType, AccountView } from '@/server/modules/accounts'

/**
 * Apoio puro da tela `Mais > Contas` (sem React, sem rede): rótulos, resumo do uso do limite e
 * montagem dos corpos de requisição. Nenhuma regra de negócio: o saldo e o uso do limite vêm
 * prontos do ledger (RN-06); aqui só se formata o que a API devolveu.
 */

export const TYPE_OPTIONS: ReadonlyArray<{ value: AccountType; label: string }> = [
  { value: 'CHECKING', label: 'Conta corrente' },
  { value: 'BUSINESS', label: 'Conta PJ' },
  { value: 'SAVINGS', label: 'Poupança' },
  { value: 'WALLET', label: 'Carteira' },
  { value: 'INVESTMENT', label: 'Investimento' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
]

export function typeLabel(type: AccountType): string {
  return TYPE_OPTIONS.find((option) => option.value === type)?.label ?? 'Conta'
}

export function hasOverdraft(type: AccountType): boolean {
  return type === 'CHECKING' || type === 'BUSINESS'
}

/** Passa de 80% do limite: a barra deixa o tom `pend` e vira `out` (tela de contas, task F1-02). */
export const USAGE_WARN_RATIO = 0.8

export interface UsageSummary {
  /** 0..1 (a barra limita sozinha). */
  ratio: number
  tone: 'pend' | 'out'
  /** "Usando R$ X do cheque especial (limite R$ Y)". */
  text: string
  /** Só quando passou do limite. */
  excessText: string | null
  /** Rótulo acessível da barra. */
  label: string
}

/** Resumo do uso do limite para a barra; `null` quando a conta não tem limite a mostrar. */
export function summarizeUsage(view: Pick<AccountView, 'usage'>): UsageSummary | null {
  const { kind, limit, used, excess } = view.usage
  if (kind === 'NONE') return null
  if (limit <= 0 && excess <= 0) return null

  const what = kind === 'OVERDRAFT' ? 'do cheque especial' : 'do limite do cartão'
  const ratio = limit > 0 ? used / limit : 1
  const text =
    limit > 0
      ? `Usando ${formatAmountText(used)} ${what} (limite ${formatAmountText(limit)})`
      : `Saldo negativo sem ${kind === 'OVERDRAFT' ? 'cheque especial' : 'limite'} configurado`
  return {
    ratio,
    tone: ratio > USAGE_WARN_RATIO || excess > 0 ? 'out' : 'pend',
    text,
    excessText: excess > 0 ? `Excedeu o limite em ${formatAmountText(excess)}` : null,
    label: `Uso ${what}`,
  }
}

// ---- formulário -------------------------------------------------------------------------

export interface AccountFormState {
  name: string
  type: AccountType
  issuerKey: string | null
  networkKey: string | null
  /** Centavos, >= 0 (o campo de dinheiro não aceita negativo). */
  overdraftCents: number
  creditCents: number
  closingDay: string
  dueDay: string
  /** Saldo inicial em módulo + sinal escolhido (só na criação). */
  openingCents: number
  openingNegative: boolean
}

export const EMPTY_FORM: AccountFormState = {
  name: '',
  type: 'CHECKING',
  issuerKey: null,
  networkKey: null,
  overdraftCents: 0,
  creditCents: 0,
  closingDay: '',
  dueDay: '',
  openingCents: 0,
  openingNegative: false,
}

export function formFromAccount(account: AccountView): AccountFormState {
  return {
    name: account.name,
    type: account.type,
    issuerKey: account.issuerKey,
    networkKey: account.networkKey,
    overdraftCents: account.overdraftLimit,
    creditCents: account.creditLimit ?? 0,
    closingDay: account.closingDay === null ? '' : String(account.closingDay),
    dueDay: account.dueDay === null ? '' : String(account.dueDay),
    openingCents: 0,
    openingNegative: false,
  }
}

/** Dia do mês digitado: inteiro ou `NaN` (a API recusa e devolve a mensagem do campo). */
function parseDay(text: string): number | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  return Number(trimmed)
}

/** Campos que dependem do tipo, só os que se aplicam a ele. */
function typedFields(form: AccountFormState): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (hasOverdraft(form.type)) fields.overdraftLimit = form.overdraftCents
  if (form.type === 'CREDIT_CARD') {
    if (form.creditCents > 0) fields.creditLimit = form.creditCents
    const closingDay = parseDay(form.closingDay)
    const dueDay = parseDay(form.dueDay)
    if (closingDay !== undefined) fields.closingDay = closingDay
    if (dueDay !== undefined) fields.dueDay = dueDay
    if (form.networkKey) fields.networkKey = form.networkKey
  }
  return fields
}

/** Corpo de `POST /api/accounts`. Cartão: o valor digitado é a dívida atual (vira negativo). */
export function buildCreateBody(form: AccountFormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: form.name,
    type: form.type,
    ...(form.issuerKey ? { issuerKey: form.issuerKey } : {}),
    ...typedFields(form),
  }
  const negative = form.type === 'CREDIT_CARD' || form.openingNegative
  if (form.openingCents !== 0) {
    body.openingBalance = negative ? -form.openingCents : form.openingCents
  }
  return body
}

/** Corpo de `PATCH /api/accounts/[id]`: envia o estado do formulário; `issuerKey` vazio limpa. */
export function buildPatchBody(
  form: AccountFormState,
  original: Pick<AccountView, 'type'>,
): Record<string, unknown> {
  return {
    name: form.name,
    ...(form.type !== original.type ? { type: form.type } : {}),
    issuerKey: form.issuerKey,
    ...typedFields(form),
  }
}
