import { describe, expect, it } from 'vitest'

import { classifyPath, decide, isRenewalCandidate, tokenKindFor } from './proxy-rules'

const HTML = 'text/html,application/xhtml+xml'

describe('decide', () => {
  describe('sem cookie', () => {
    it.each([
      '/hoje',
      '/lancamentos',
      '/planejar',
      '/cartoes',
      '/mais',
      '/',
      '/qualquer-coisa',
      '/rota/inventada/aninhada',
      '//evil',
      '/login-falso',
      '/loginx',
    ])('navegação a %s redireciona para o login', (pathname) => {
      expect(decide({ pathname, hasCookie: false, accept: HTML })).toBe('redirect-login')
    })

    it.each(['/api/accounts', '/api/transactions/transfer', '/api/auth/me', '/api/auth/logout'])(
      'API %s responde 401',
      (pathname) => {
        expect(decide({ pathname, hasCookie: false, accept: '*/*' })).toBe('unauthorized')
      },
    )

    it('pedido JSON a uma página não vira redirecionamento', () => {
      expect(decide({ pathname: '/hoje', hasCookie: false, accept: 'application/json' })).toBe(
        'unauthorized',
      )
    })

    it.each([
      '/login',
      '/login/',
      '/api/auth/login',
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/icons/maskable/icon-512.png',
      '/apple-touch-icon.png',
      '/favicon.ico',
      '/brands/nubank.svg',
      '/_next/static/chunks/a.js',
      '/_next/image',
      '/api/health',
    ])('%s é público', (pathname) => {
      expect(decide({ pathname, hasCookie: false, accept: HTML })).toBe('next')
    })

    it.each([
      '/api/cron/job',
      '/api/cron/recurrences',
      '/api/telegram/webhook',
      '/api/mcp',
      '/api/mcp/sse',
    ])('%s usa segredo próprio (o proxy deixa passar)', (pathname) => {
      expect(decide({ pathname, hasCookie: false, accept: '*/*' })).toBe('next')
    })

    it('prefixos parecidos com as allowlists NÃO são públicos', () => {
      for (const pathname of [
        '/api/cronx',
        '/api/mcpx',
        '/api/telegram/webhook-x',
        '/api/telegram',
        '/iconsx/a.png',
        '/brandsx/a.svg',
        '/_nextx/a',
        '/api/auth/login/extra',
        '/api/auth/register',
        '/register',
      ]) {
        expect(classifyPath(pathname)).not.toBe('public')
        expect(classifyPath(pathname)).not.toBe('token')
        expect(decide({ pathname, hasCookie: false, accept: HTML })).not.toBe('next')
      }
    })

    it('/ui só passa fora de produção', () => {
      expect(decide({ pathname: '/ui', hasCookie: false, accept: HTML })).toBe('redirect-login')
      expect(decide({ pathname: '/ui', hasCookie: false, accept: HTML, isProduction: false })).toBe(
        'next',
      )
      expect(
        decide({ pathname: '/ui/x', hasCookie: false, accept: HTML, isProduction: false }),
      ).toBe('next')
      expect(
        decide({ pathname: '/uiextra', hasCookie: false, accept: HTML, isProduction: false }),
      ).toBe('redirect-login')
    })
  })

  describe('com cookie', () => {
    it.each(['/hoje', '/qualquer-coisa', '/api/accounts', '/api/auth/me', '/login'])(
      '%s segue (a validação real é no servidor)',
      (pathname) => {
        expect(decide({ pathname, hasCookie: true, accept: HTML })).toBe('next')
      },
    )
  })
})

describe('tokenKindFor', () => {
  it('mapeia cada rota ao seu segredo', () => {
    expect(tokenKindFor('/api/cron/x')).toBe('cron')
    expect(tokenKindFor('/api/cron')).toBe('cron')
    expect(tokenKindFor('/api/telegram/webhook')).toBe('telegram')
    expect(tokenKindFor('/api/mcp')).toBe('mcp')
    expect(tokenKindFor('/api/mcp/')).toBe('mcp')
    expect(tokenKindFor('/api/accounts')).toBeNull()
    expect(tokenKindFor('/hoje')).toBeNull()
  })
})

describe('isRenewalCandidate', () => {
  it('só GET em página protegida com cookie', () => {
    expect(isRenewalCandidate({ pathname: '/hoje', method: 'GET', hasCookie: true })).toBe(true)
    expect(isRenewalCandidate({ pathname: '/hoje', method: 'POST', hasCookie: true })).toBe(false)
    expect(isRenewalCandidate({ pathname: '/hoje', method: 'GET', hasCookie: false })).toBe(false)
    expect(isRenewalCandidate({ pathname: '/api/accounts', method: 'GET', hasCookie: true })).toBe(
      false,
    )
    expect(isRenewalCandidate({ pathname: '/login', method: 'GET', hasCookie: true })).toBe(false)
  })
})
