// Decisões do proxy (FC2-F0-06): módulo puro, testável sem Next. Proteção por padrão (RN-04):
// tudo exige o cookie de sessão, exceto as allowlists abaixo. Nenhum prefixo de produto é listado.

export type TokenKind = 'cron' | 'telegram' | 'mcp'
export type PathClass = 'public' | 'token' | 'api' | 'page'
export type ProxyDecision = 'next' | 'redirect-login' | 'unauthorized'

/** Caminhos públicos exatos. */
export const PUBLIC_EXACT_PATHS = [
  '/login',
  '/api/auth/login',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/api/health',
] as const

/** Prefixos públicos (assets estáticos e internos do Next). */
export const PUBLIC_PREFIXES = ['/_next/', '/icons/', '/brands/'] as const

/** Galeria de desenvolvimento: só passa fora de produção (em produção a rota já responde 404). */
export const DEV_ONLY_PREFIXES = ['/ui'] as const

/** Rotas com autenticação própria (sem cookie): `[caminho, tipo de segredo]`. */
export const TOKEN_PATHS: ReadonlyArray<readonly [string, TokenKind]> = [
  ['/api/cron', 'cron'],
  ['/api/telegram/webhook', 'telegram'],
  ['/api/mcp', 'mcp'],
]

function matchesSegment(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** Remove barras finais (exceto a raiz), pois o Next trata `/login/` como `/login`. */
export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '') || '/'
  return pathname
}

/** Tipo de segredo exigido para o caminho, ou `null` quando ele usa cookie. */
export function tokenKindFor(pathname: string): TokenKind | null {
  const path = normalizePath(pathname)
  for (const [base, kind] of TOKEN_PATHS) {
    if (matchesSegment(path, base)) return kind
  }
  return null
}

export function classifyPath(pathname: string, isProduction = true): PathClass {
  const path = normalizePath(pathname)
  if (tokenKindFor(path)) return 'token'
  if ((PUBLIC_EXACT_PATHS as readonly string[]).includes(path)) return 'public'
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'public'
  if (!isProduction && DEV_ONLY_PREFIXES.some((base) => matchesSegment(path, base))) return 'public'
  if (matchesSegment(path, '/api')) return 'api'
  return 'page'
}

export type DecideInput = {
  pathname: string
  hasCookie: boolean
  /** Cabeçalho `Accept` da requisição. */
  accept?: string | null
  /** Padrão: produção (mais restritivo). */
  isProduction?: boolean
}

/**
 * - `next`: segue (público, com segredo próprio ou com cookie presente).
 * - `redirect-login`: navegação sem cookie vai para `/login?callbackUrl=...`.
 * - `unauthorized`: API sem cookie responde 401.
 *
 * `/login` sempre segue: quem decide se há sessão válida é a página (consulta o banco). Redirecionar
 * `/login` para `/hoje` só pela existência do cookie cria laço quando o cookie está obsoleto.
 */
export function decide({
  pathname,
  hasCookie,
  accept,
  isProduction = true,
}: DecideInput): ProxyDecision {
  const kind = classifyPath(pathname, isProduction)
  if (kind === 'public' || kind === 'token') return 'next'
  if (hasCookie) return 'next'
  if (kind === 'api') return 'unauthorized'

  const wantsJsonOnly =
    !!accept && accept.includes('application/json') && !accept.includes('text/html')
  return wantsJsonOnly ? 'unauthorized' : 'redirect-login'
}

/** A renovação do cookie só ocorre em navegação `GET` a uma página protegida com cookie. */
export function isRenewalCandidate(input: {
  pathname: string
  method: string
  hasCookie: boolean
  isProduction?: boolean
}): boolean {
  return (
    input.hasCookie &&
    input.method === 'GET' &&
    classifyPath(input.pathname, input.isProduction ?? true) === 'page'
  )
}
