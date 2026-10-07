import crypto from 'node:crypto'

import type { Clock, LoginAttemptRepository } from './ports'

// Limitação de tentativas de login persistida em `LoginAttempt` (serverless não compartilha memória).
// RN-07: 5 falhas em 15 minutos bloqueiam a chave até a falha mais antiga da janela sair dela.

export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_MAX_FAILURES = 5
export const LOGIN_PURGE_AFTER_MS = 24 * 60 * 60 * 1000

export type RateLimitDeps = { attempts: LoginAttemptRepository; now: Clock }

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/** Chave opaca `sha256(ip|email)`: o banco não guarda IP nem e-mail em claro. */
export function loginRateLimitKey(ip: string, email: string): string {
  return crypto.createHash('sha256').update(`${ip}|${email.trim().toLowerCase()}`).digest('hex')
}

/** Decide pela lista de falhas (ordem crescente) da janela. */
function evaluateFailures(failures: Date[], now: Date): RateLimitResult {
  if (failures.length < LOGIN_MAX_FAILURES) return { allowed: true }

  // Volta a liberar quando restarem menos de 5 falhas na janela deslizante.
  const pivot = failures[failures.length - LOGIN_MAX_FAILURES]
  const retryAfterMs = pivot.getTime() + LOGIN_WINDOW_MS - now.getTime()
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
}

export async function checkLoginAllowed(
  deps: RateLimitDeps,
  key: string,
): Promise<RateLimitResult> {
  const now = deps.now()
  const failures = await deps.attempts.listFailures(key, new Date(now.getTime() - LOGIN_WINDOW_MS))
  return evaluateFailures(failures, now)
}

/**
 * Reserva atômica de uma tentativa (RN-07). Consultar, rodar o bcrypt e só então gravar deixa
 * uma rajada paralela passar do limite (todas leem "0 falhas" antes de qualquer gravação).
 * Aqui a tentativa é gravada ANTES do bcrypt, como falha provisória, e a contagem é relida
 * depois de gravar: quem enxerga mais de 5 falhas (contando a si mesmo) desfaz a própria linha
 * e é bloqueado. Toda tentativa que prossegue gravou a própria linha antes de contar, então a
 * última a contar enxerga todas as que prosseguem: no máximo 5 chegam ao bcrypt por janela.
 * A falha provisória vira a falha definitiva; no sucesso, `recordLoginSuccess` limpa a chave.
 */
export async function reserveLoginAttempt(
  deps: RateLimitDeps,
  key: string,
): Promise<RateLimitResult> {
  // Caminho barato: chave já bloqueada não grava nada (e não estende o bloqueio).
  const gate = await checkLoginAllowed(deps, key)
  if (!gate.allowed) return gate

  const at = deps.now()
  const attemptId = await deps.attempts.record(key, false, at)
  const failures = await deps.attempts.listFailures(key, new Date(at.getTime() - LOGIN_WINDOW_MS))
  if (failures.length <= LOGIN_MAX_FAILURES) return { allowed: true }

  // Estourou na disputa: desfaz só a própria linha e calcula o Retry-After sem ela.
  await deps.attempts.remove(attemptId)
  const own = failures.findIndex((date) => date.getTime() === at.getTime())
  const others = own === -1 ? failures : failures.filter((_, index) => index !== own)
  const verdict = evaluateFailures(others, at)
  return verdict.allowed ? { allowed: false, retryAfterSeconds: 1 } : verdict
}

export async function recordLoginFailure(deps: RateLimitDeps, key: string): Promise<void> {
  await deps.attempts.record(key, false, deps.now())
}

/** Sucesso limpa a chave. */
export async function recordLoginSuccess(deps: RateLimitDeps, key: string): Promise<void> {
  await deps.attempts.clear(key)
}

/** Limpeza oportunista de linhas com mais de 24h. */
export async function purgeOldAttempts(deps: RateLimitDeps): Promise<void> {
  await deps.attempts.purgeOlderThan(new Date(deps.now().getTime() - LOGIN_PURGE_AFTER_MS))
}
