import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE_NAME = 'fc_session'

const AUTH_ROUTES = ['/login', '/register']
const PROTECTED_ROUTES = [
  '/dashboard',
  '/transactions',
  '/accounts',
  '/categories',
  '/recurring',
  '/settings',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME)

  if (hasSession && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
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
