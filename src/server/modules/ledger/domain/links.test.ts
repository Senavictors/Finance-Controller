import { describe, expect, it } from 'vitest'
import { EMPTY_LINKS, linkRefsOf, normalizeLinks, normalizeLinksPatch } from './links'
import { LedgerError } from './types'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return error instanceof LedgerError ? error.code : 'OTHER'
  }
  return undefined
}

describe('normalizeLinks', () => {
  it('sem entrada devolve todos os vínculos nulos', () => {
    expect(normalizeLinks(undefined)).toEqual(EMPTY_LINKS)
    expect(normalizeLinks({})).toEqual(EMPTY_LINKS)
  })

  it('preserva vínculos válidos e apara espaços', () => {
    const links = normalizeLinks({
      statementId: ' st-1 ',
      statementKey: '2026-11',
      occurrenceKey: 'serie:2026-11-05',
      categorySource: 'RULE',
      aiConfidence: 0,
    })
    expect(links.statementId).toBe('st-1')
    expect(links.statementKey).toBe('2026-11')
    expect(links.occurrenceKey).toBe('serie:2026-11-05')
    expect(links.categorySource).toBe('RULE')
    expect(links.aiConfidence).toBe(0)
    expect(links.refundOfId).toBeNull()
  })

  it.each(['2026-13', '2026-00', '26-11', '2026-1', '2026-11-05', ''])(
    'rejeita statementKey %j',
    (key) => {
      expect(codeOf(() => normalizeLinks({ statementKey: key }))).toBe('LEDGER_INVALID_LINK')
    },
  )

  it('rejeita texto vazio, longo demais e tipos errados', () => {
    expect(codeOf(() => normalizeLinks({ occurrenceKey: '   ' }))).toBe('LEDGER_INVALID_LINK')
    expect(codeOf(() => normalizeLinks({ importHash: 'x'.repeat(201) }))).toBe(
      'LEDGER_INVALID_LINK',
    )
    expect(codeOf(() => normalizeLinks({ seriesId: 5 as unknown as string }))).toBe(
      'LEDGER_INVALID_LINK',
    )
  })

  it.each([-1, 101, 1.5, Number.NaN])('rejeita aiConfidence %s', (value) => {
    expect(codeOf(() => normalizeLinks({ aiConfidence: value }))).toBe('LEDGER_INVALID_LINK')
  })

  it('rejeita categorySource desconhecido', () => {
    expect(codeOf(() => normalizeLinks({ categorySource: 'ROBOT' as unknown as 'USER' }))).toBe(
      'LEDGER_INVALID_LINK',
    )
  })
})

describe('normalizeLinksPatch', () => {
  it('só inclui as chaves informadas; null limpa', () => {
    expect(normalizeLinksPatch({ statementId: null, statementKey: '2026-12' })).toEqual({
      statementId: null,
      statementKey: '2026-12',
    })
    expect(normalizeLinksPatch({ statementId: undefined })).toEqual({})
  })
})

describe('linkRefsOf', () => {
  it('extrai só as referências a outras tabelas', () => {
    expect(linkRefsOf({ statementId: 's', occurrenceKey: 'k', refundOfId: 'r' })).toEqual({
      statementId: 's',
      seriesId: null,
      importBatchId: null,
      refundOfId: 'r',
    })
  })
})
