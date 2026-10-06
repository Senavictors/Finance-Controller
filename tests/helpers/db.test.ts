import { describe, expect, it } from 'vitest'
import { assertTestDatabaseUrl, databaseNameFromUrl, getTestDb } from './db'

// Montadas por partes: nenhuma credencial real; hosts fictícios.
const url = (database: string): string =>
  ['postgresql://', 'ci:ci', '@', 'localhost:5432/', database].join('')

describe('getTestDb', () => {
  it('retorna null sem DATABASE_URL_TEST', () => {
    expect(getTestDb({})).toBeNull()
    expect(getTestDb({ DATABASE_URL_TEST: '' })).toBeNull()
  })

  it('lança se o nome do database não contiver test/branch', () => {
    expect(() => getTestDb({ DATABASE_URL_TEST: url('app') })).toThrow(/test|branch/)
    expect(() => getTestDb({ DATABASE_URL_TEST: url('neondb') })).toThrow()
    expect(() => getTestDb({ DATABASE_URL_TEST: url('') })).toThrow()
  })

  it('lança se a URL de teste for idêntica à do banco principal', () => {
    const same = url('app_test')
    expect(() => getTestDb({ DATABASE_URL_TEST: same, DATABASE_URL: same })).toThrow(/principal/)
  })

  it('lança para URL inválida', () => {
    expect(() => getTestDb({ DATABASE_URL_TEST: 'nao-e-url' })).toThrow(/inválida/)
  })

  it('retorna um cliente (conexão preguiçosa) para database de teste', async () => {
    const db = getTestDb({ DATABASE_URL_TEST: url('fc_test') })
    expect(db).not.toBeNull()
    await db?.$disconnect()
    const branch = getTestDb({ DATABASE_URL_TEST: url('pr-123-branch') })
    expect(branch).not.toBeNull()
    await branch?.$disconnect()
  })
})

describe('assertTestDatabaseUrl / databaseNameFromUrl', () => {
  it('extrai o nome do database ignorando query string', () => {
    expect(databaseNameFromUrl(`${url('fc_test')}?sslmode=require`)).toBe('fc_test')
  })

  it('aceita nomes com test ou branch, em qualquer caixa', () => {
    expect(() => assertTestDatabaseUrl(url('FC_TEST'))).not.toThrow()
    expect(() => assertTestDatabaseUrl(url('my-branch-db'))).not.toThrow()
  })
})
