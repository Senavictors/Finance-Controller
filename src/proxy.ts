import { NextRequest, NextResponse } from 'next/server'

import { decide, isRenewalCandidate, normalizePath, tokenKindFor } from '@/server/auth/proxy-rules'
import { isTokenAuthorized } from '@/server/auth/secrets'
import {
  renewalDay,
  SESSION_COOKIE_NAME,
  SESSION_RENEW_COOKIE_NAME,
  sessionCookieOptions,
  shouldReissueCookie,
} from '@/server/auth/session-policy'

// Proxy do Next 16 (substitui `middleware.ts`). Proteção por padrão: ver `proxy-rules.ts`.
// A checagem do cookie é otimista (só existência); a validação real (hash no banco) ocorre em
// `requireAuth()` e no layout de `(app)`. Nunca confie só no proxy.

const isProduction = process.env.NODE_ENV === 'production'

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const hasCookie = !!cookieValue

  // Rotas com segredo próprio (cron, webhook, MCP): camada extra antes do handler, fail closed.
  const tokenKind = tokenKindFor(pathname)
  if (tokenKind && !isTokenAuthorized(tokenKind, request.headers)) {
    return unauthorized()
  }

  const decision = decide({
    pathname,
    hasCookie,
    accept: request.headers.get('accept'),
    isProduction,
  })

  if (decision === 'unauthorized') return unauthorized()

  if (decision === 'redirect-login') {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', `${normalizePath(pathname)}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next()

  // Renovação deslizante do cookie: Server Components não gravam cookie, então reemitimos aqui,
  // no máximo uma vez por dia (marca em `fc_session_r`). O banco continua sendo a fonte da expiração.
  if (
    cookieValue &&
    request.headers.get('next-router-prefetch') === null &&
    isRenewalCandidate({ pathname, method: request.method, hasCookie, isProduction }) &&
    shouldReissueCookie(request.cookies.get(SESSION_RENEW_COOKIE_NAME)?.value, new Date())
  ) {
    const options = sessionCookieOptions(isProduction)
    response.cookies.set(SESSION_COOKIE_NAME, cookieValue, options)
    response.cookies.set(SESSION_RENEW_COOKIE_NAME, renewalDay(new Date()), options)
  }

  return response
}

export const config = {
  // Tudo, exceto os assets estáticos do Next. Nenhum prefixo de produto é listado (RN-04).
  matcher: ['/((?!_next/static|_next/image).*)'],
}
