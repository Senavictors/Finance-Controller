import {
  CATEGORY_SOURCES,
  LedgerError,
  TXN_LINK_FIELDS,
  type CategorySource,
  type TxnLinks,
} from './types'

/** `AAAA-MM` (mês de vencimento da fatura). */
export const STATEMENT_KEY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/

/** Limite de tamanho das chaves de texto (ids, `occurrenceKey`, `importHash`). */
export const MAX_LINK_LENGTH = 200

export const EMPTY_LINKS: Readonly<TxnLinks> = Object.freeze({
  refundOfId: null,
  seriesId: null,
  occurrenceKey: null,
  statementId: null,
  statementKey: null,
  importBatchId: null,
  importHash: null,
  categorySource: null,
  aiConfidence: null,
})

/** Vínculos informados pelo chamador (campos omitidos ou `undefined` = não informado). */
export type TxnLinksInput = Partial<TxnLinks>

function invalid(field: string, message: string): LedgerError {
  return new LedgerError('LEDGER_INVALID_LINK', message, { field })
}

function normalizeText(field: string, value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw invalid(field, `${field} deve ser texto.`)
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_LINK_LENGTH) {
    throw invalid(field, `${field} deve ter de 1 a ${MAX_LINK_LENGTH} caracteres.`)
  }
  return trimmed
}

function normalizeField<K extends keyof TxnLinks>(field: K, value: unknown): TxnLinks[K] {
  switch (field) {
    case 'statementKey': {
      const text = normalizeText(field, value)
      if (text !== null && !STATEMENT_KEY_PATTERN.test(text)) {
        throw invalid(field, 'statementKey deve estar no formato AAAA-MM.')
      }
      return text as TxnLinks[K]
    }
    case 'categorySource': {
      if (value === null) return null as TxnLinks[K]
      if (!(CATEGORY_SOURCES as readonly unknown[]).includes(value)) {
        throw invalid(field, `categorySource inválido: ${String(value)}.`)
      }
      return value as CategorySource as TxnLinks[K]
    }
    case 'aiConfidence': {
      if (value === null) return null as TxnLinks[K]
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
        throw invalid(field, 'aiConfidence deve ser inteiro entre 0 e 100.')
      }
      return value as TxnLinks[K]
    }
    default:
      return normalizeText(field, value) as TxnLinks[K]
  }
}

/**
 * Valida e completa os vínculos de um lançamento novo: o que não foi informado vira `null`.
 * Lança `LEDGER_INVALID_LINK` (400) para formato inválido.
 */
export function normalizeLinks(input: TxnLinksInput | undefined): TxnLinks {
  const links: TxnLinks = { ...EMPTY_LINKS }
  if (!input) return links
  for (const field of TXN_LINK_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    ;(links as unknown as Record<string, unknown>)[field] = normalizeField(field, value)
  }
  return links
}

/**
 * Valida um patch de vínculos: só as chaves presentes (e diferentes de `undefined`) entram;
 * `null` limpa o vínculo.
 */
export function normalizeLinksPatch(input: TxnLinksInput): Partial<TxnLinks> {
  const patch: Partial<TxnLinks> = {}
  for (const field of TXN_LINK_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    ;(patch as unknown as Record<string, unknown>)[field] = normalizeField(field, value)
  }
  return patch
}

/** Vínculos de referência (outras tabelas) que precisam existir e pertencer ao usuário. */
export interface LinkRefs {
  statementId: string | null
  seriesId: string | null
  importBatchId: string | null
  refundOfId: string | null
}

export function linkRefsOf(links: Partial<TxnLinks>): LinkRefs {
  return {
    statementId: links.statementId ?? null,
    seriesId: links.seriesId ?? null,
    importBatchId: links.importBatchId ?? null,
    refundOfId: links.refundOfId ?? null,
  }
}

/** Chave de `userLocked` que protege o vínculo de fatura (`statementId`/`statementKey`). */
export const STATEMENT_LOCK_KEY = 'statement'

/** Campos de vínculo cobertos pela chave `statement` de `userLocked` (ADR-024). */
export const STATEMENT_LOCKED_FIELDS = ['statementId', 'statementKey'] as const
