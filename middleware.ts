import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE_NAME = 'fc_session'

// Provisório: reescrito na FC2-F0-06 (renovação deslizante da sessão).
const AUTH_ROUTES = ['/login']
const PROTECTED_ROUTES = ['/hoje', '/lancamentos', '/planejar', '/cartoes', '/mais']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME)

  if (hasSession && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/hoje', request.url))
  }

  if (!hasSession && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
