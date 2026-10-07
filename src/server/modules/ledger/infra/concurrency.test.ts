import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { LedgerError } from '../domain/types'
import { isMissingRowError, isRetryableConcurrencyError } from './concurrency'
import { PrismaLedgerRepository } from './prisma-ledger-repository'

function prismaError(code: string, message = 'x', extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { code, ...extra })
}

describe('classificação de erros de concorrência', () => {
  it('reconhece deadlock e falha de serialização em qualquer ponto da cadeia', () => {
    expect(isRetryableConcurrencyError(prismaError('P2034'))).toBe(true)
    expect(isRetryableConcurrencyError(new Error('deadlock detected'))).toBe(true)
    expect(
      isRetryableConcurrencyError(
        prismaError('P2010', 'raw query failed', { meta: { code: '40P01' } }),
      ),
    ).toBe(true)
    expect(
      isRetryableConcurrencyError(
        new Error('falha', { cause: { driverAdapterError: { cause: { originalCode: '40001' } } } }),
      ),
    ).toBe(true)
    expect(
      isRetryableConcurrencyError(new Error('could not serialize access due to concurrent update')),
    ).toBe(true)
  })

  it('não confunde erros comuns com concorrência', () => {
    expect(isRetryableConcurrencyError(new Error('Unique constraint failed'))).toBe(false)
    expect(isRetryableConcurrencyError(prismaError('P2002'))).toBe(false)
    expect(isRetryableConcurrencyError(new LedgerError('LEDGER_TXN_NOT_FOUND', 'x'))).toBe(false)
    expect(isRetryableConcurrencyError(null)).toBe(false)
    expect(isRetryableConcurrencyError('40P01 em texto solto')).toBe(true)
  })

  it('P2025 é linha ausente (mutação concorrente), não retentável', () => {
    expect(isMissingRowError(prismaError('P2025'))).toBe(true)
    expect(isRetryableConcurrencyError(prismaError('P2025'))).toBe(false)
    expect(isMissingRowError(prismaError('P2002'))).toBe(false)
  })
})

describe('PrismaLedgerRepository.withTransaction (cliente simulado)', () => {
  function repoWith(transaction: ReturnType<typeof vi.fn>) {
    return new PrismaLedgerRepository({ $transaction: transaction } as unknown as PrismaClient)
  }

  it('refaz a transação uma vez em deadlock (40P01) e devolve o resultado', async () => {
    const $transaction = vi
      .fn()
      .mockRejectedValueOnce(prismaError('P2010', 'raw', { meta: { code: '40P01' } }))
      .mockResolvedValueOnce('ok')
    await expect(repoWith($transaction).withTransaction(async () => 'x')).resolves.toBe('ok')
    expect($transaction).toHaveBeenCalledTimes(2)
  })

  it('deadlock persistente vira 409 LEDGER_CONCURRENT_UPDATE após 1 retry', async () => {
    const $transaction = vi.fn().mockRejectedValue(prismaError('P2034'))
    await expect(repoWith($transaction).withTransaction(async () => 'x')).rejects.toMatchObject({
      code: 'LEDGER_CONCURRENT_UPDATE',
      category: 'CONFLICT',
    })
    expect($transaction).toHaveBeenCalledTimes(2)
  })

  it('P2025 vira LEDGER_CONCURRENT_UPDATE sem retry', async () => {
    const $transaction = vi.fn().mockRejectedValue(prismaError('P2025'))
    await expect(repoWith($transaction).withTransaction(async () => 'x')).rejects.toMatchObject({
      code: 'LEDGER_CONCURRENT_UPDATE',
    })
    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('outros erros (inclusive LedgerError) passam intactos, sem retry', async () => {
    const domain = new LedgerError('LEDGER_RECONCILED_LOCKED', 'travado')
    const other = new Error('boom')
    const a = vi.fn().mockRejectedValue(domain)
    const b = vi.fn().mockRejectedValue(other)
    await expect(repoWith(a).withTransaction(async () => 'x')).rejects.toBe(domain)
    await expect(repoWith(b).withTransaction(async () => 'x')).rejects.toBe(other)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
