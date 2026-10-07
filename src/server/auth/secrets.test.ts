import { describe, expect, it } from 'vitest'

import { AuthError } from './errors'
import {
  isTokenAuthorized,
  requireCronSecret,
  requireMcpToken,
  requireTelegramSecret,
  safeEqual,
} from './secrets'

// Valores fictícios, só para os testes.
const ENV = {
  CRON_SECRET: 'cron-test-secret',
  TELEGRAM_WEBHOOK_SECRET: 'telegram-test-secret',
  MCP_TOKEN: 'mcp-test-token',
}

function req(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/x', { method: 'POST', headers })
}

describe('safeEqual', () => {
  it('iguais passam; diferentes (inclusive de comprimento distinto) não lançam', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', 'abc')).toBe(false)
  })
})

describe('requireCronSecret', () => {
  it('passa com o Bearer correto', () => {
    expect(() =>
      requireCronSecret(req({ authorization: 'Bearer cron-test-secret' }), ENV),
    ).not.toThrow()
  })
  it('nega sem header, com valor errado, com comprimento diferente e sem esquema Bearer', () => {
    expect(() => requireCronSecret(req(), ENV)).toThrow(AuthError)
    expect(() => requireCronSecret(req({ authorization: 'Bearer errado' }), ENV)).toThrow(AuthError)
    expect(() => requireCronSecret(req({ authorization: 'Bearer x' }), ENV)).toThrow(AuthError)
    expect(() => requireCronSecret(req({ authorization: 'cron-test-secret' }), ENV)).toThrow(
      AuthError,
    )
  })
  it('fail closed: segredo ausente ou vazio nega mesmo com header', () => {
    expect(() => requireCronSecret(req({ authorization: 'Bearer ' }), {})).toThrow(AuthError)
    expect(() =>
      requireCronSecret(req({ authorization: 'Bearer undefined' }), { CRON_SECRET: undefined }),
    ).toThrow(AuthError)
    expect(() =>
      requireCronSecret(req({ authorization: 'Bearer  ' }), { CRON_SECRET: '' }),
    ).toThrow(AuthError)
  })
})

describe('requireTelegramSecret', () => {
  it('passa com o secret token correto', () => {
    expect(() =>
      requireTelegramSecret(
        req({ 'x-telegram-bot-api-secret-token': 'telegram-test-secret' }),
        ENV,
      ),
    ).not.toThrow()
  })
  it('nega ausente, errado e sem segredo configurado', () => {
    expect(() => requireTelegramSecret(req(), ENV)).toThrow(AuthError)
    expect(() =>
      requireTelegramSecret(req({ 'x-telegram-bot-api-secret-token': 'outro' }), ENV),
    ).toThrow(AuthError)
    expect(() =>
      requireTelegramSecret(req({ 'x-telegram-bot-api-secret-token': 'telegram-test-secret' }), {}),
    ).toThrow(AuthError)
  })
})

describe('requireMcpToken', () => {
  it('passa com o Bearer correto', () => {
    expect(() =>
      requireMcpToken(req({ authorization: 'Bearer mcp-test-token' }), ENV),
    ).not.toThrow()
  })
  it('nega errado, ausente e sem segredo configurado', () => {
    expect(() => requireMcpToken(req({ authorization: 'Bearer nope' }), ENV)).toThrow(AuthError)
    expect(() => requireMcpToken(req(), ENV)).toThrow(AuthError)
    expect(() => requireMcpToken(req({ authorization: 'Bearer mcp-test-token' }), {})).toThrow(
      AuthError,
    )
  })
  it('um segredo não vale para outro endpoint', () => {
    const headers = new Headers({ authorization: 'Bearer cron-test-secret' })
    expect(isTokenAuthorized('cron', headers, ENV)).toBe(true)
    expect(isTokenAuthorized('mcp', headers, ENV)).toBe(false)
  })
})

describe('esquema Bearer (RFC 7235: nome do esquema sem diferenciar maiúsculas)', () => {
  it.each(['bearer', 'BEARER', 'BeArEr'])('aceita "%s" com o segredo correto', (scheme) => {
    expect(() =>
      requireCronSecret(req({ authorization: `${scheme} cron-test-secret` }), ENV),
    ).not.toThrow()
    expect(() =>
      requireMcpToken(req({ authorization: `${scheme} mcp-test-token` }), ENV),
    ).not.toThrow()
  })
  it('o valor do token continua sensível a maiúsculas e o esquema precisa existir', () => {
    expect(() => requireCronSecret(req({ authorization: 'bearer CRON-TEST-SECRET' }), ENV)).toThrow(
      AuthError,
    )
    expect(() => requireCronSecret(req({ authorization: 'Basic cron-test-secret' }), ENV)).toThrow(
      AuthError,
    )
    expect(() => requireCronSecret(req({ authorization: 'bearer' }), ENV)).toThrow(AuthError)
  })
})
