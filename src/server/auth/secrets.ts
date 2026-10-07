import crypto from 'node:crypto'

import { AuthError } from './errors'
import type { TokenKind } from './proxy-rules'

// Autenticação das rotas que não usam cookie (ADR-027, ADR-030): cron, webhook do Telegram e MCP.
// Fail closed: segredo ausente ou vazio nega sempre. Comparação em tempo constante.

export type SecretEnv = Record<string, string | undefined>

/** Compara em tempo constante e sem lançar, mesmo com comprimentos diferentes (compara SHA-256). */
export function safeEqual(received: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(received).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

function readSecret(env: SecretEnv, name: string): string | null {
  const value = env[name]
  return value && value.trim().length > 0 ? value : null
}

function bearerToken(headers: Headers): string | null {
  const header = headers.get('authorization')
  if (!header) return null
  // RFC 7235: o nome do esquema de autenticação não diferencia maiúsculas de minúsculas.
  const match = /^Bearer (.+)$/i.exec(header)
  return match ? match[1] : null
}

export function isCronAuthorized(headers: Headers, env: SecretEnv = process.env): boolean {
  const secret = readSecret(env, 'CRON_SECRET')
  const token = bearerToken(headers)
  return secret !== null && token !== null && safeEqual(token, secret)
}

export function isTelegramAuthorized(headers: Headers, env: SecretEnv = process.env): boolean {
  const secret = readSecret(env, 'TELEGRAM_WEBHOOK_SECRET')
  const token = headers.get('x-telegram-bot-api-secret-token')
  return secret !== null && token !== null && safeEqual(token, secret)
}

export function isMcpAuthorized(headers: Headers, env: SecretEnv = process.env): boolean {
  const secret = readSecret(env, 'MCP_TOKEN')
  const token = bearerToken(headers)
  return secret !== null && token !== null && safeEqual(token, secret)
}

/** Lança `AuthError` quando o `Authorization: Bearer` não bate com `CRON_SECRET`. */
export function requireCronSecret(request: Request, env: SecretEnv = process.env): void {
  if (!isCronAuthorized(request.headers, env)) throw new AuthError()
}

/** Lança `AuthError` quando `X-Telegram-Bot-Api-Secret-Token` não bate com `TELEGRAM_WEBHOOK_SECRET`. */
export function requireTelegramSecret(request: Request, env: SecretEnv = process.env): void {
  if (!isTelegramAuthorized(request.headers, env)) throw new AuthError()
}

/** Lança `AuthError` quando o `Authorization: Bearer` não bate com `MCP_TOKEN`. */
export function requireMcpToken(request: Request, env: SecretEnv = process.env): void {
  if (!isMcpAuthorized(request.headers, env)) throw new AuthError()
}

/** Verifica o segredo do tipo informado (usado pelo proxy como camada extra, antes do handler). */
export function isTokenAuthorized(
  kind: TokenKind,
  headers: Headers,
  env: SecretEnv = process.env,
): boolean {
  switch (kind) {
    case 'cron':
      return isCronAuthorized(headers, env)
    case 'telegram':
      return isTelegramAuthorized(headers, env)
    case 'mcp':
      return isMcpAuthorized(headers, env)
  }
}
