import { describe, expect, it } from 'vitest'
import { day, errorCodeOf, makeCardsEnv, OTHER_USER, type CardsEnv } from './test-helpers'

/** Fatura 2026-10 de R$ 380,00 (compra à vista em 05/10), já fechada em 12/10. */
async function closedStatement380(env: CardsEnv) {
  const created = await env.svc.createCardPurchase(env.ctx, {
    accountId: 'card',
    amount: 38_000,
    date: day('2026-10-05'),
    description: 'Compra sintetica',
  })
  env.setNow('2026-10-12')
  return created.statements[0]!
}

describe('payStatement', () => {
  it('CA-05: pagamento parcial de R$ 200,00 em R$ 380,00 segue CLOSED; pagar o resto => PAID', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)

    const first = await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-12'),
    })
    expect(first.statement).toMatchObject({
      total: 38_000,
      paid: 20_000,
      open: 18_000,
      status: 'CLOSED',
    })

    const second = await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 18_000,
      date: day('2026-10-13'),
    })
    expect(second.statement).toMatchObject({ paid: 38_000, open: 0, status: 'PAID' })
    env.expectConsistent()
  })

  it('grava o par CARD_PAYMENT: -X na origem, +X no cartão com a fatura, fora de orçamento', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)

    const result = await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-12'),
    })
    const source = env.ledgerRepo.txns.get(result.sourceTransactionId)!
    const card = env.ledgerRepo.txns.get(result.cardTransactionId)!
    expect(source).toMatchObject({
      accountId: 'chk',
      kind: 'CARD_PAYMENT',
      amount: -20_000,
      status: 'CLEARED',
      excludeFromBudget: true,
      statementId: null,
    })
    expect(card).toMatchObject({
      accountId: 'card',
      kind: 'CARD_PAYMENT',
      amount: 20_000,
      status: 'CLEARED',
      excludeFromBudget: true,
      statementId: statement.id,
      statementKey: '2026-10',
    })
    expect(source.transferId).toBe(card.transferId)
    expect(result.transferId).toBe(card.transferId)
    expect(env.ledgerRepo.balances.get('chk')!.balanceCleared).toBe(80_000)
    env.expectConsistent()
  })

  it('CA-06: saldo R$ 100,00, cheque especial R$ 500,00, pagando R$ 300,00 => usa R$ 200,00', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 10_000)
    const statement = await closedStatement380(env)

    const result = await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 30_000,
      date: day('2026-10-12'),
    })
    expect(result.overdraftWarning).toEqual({
      willUseOverdraft: true,
      usedAfter: 20_000,
      excessAfter: 0,
    })
    // as duas pernas foram gravadas e o ledger concorda com o aviso
    expect(env.txnsOf('chk').filter((t) => t.kind === 'CARD_PAYMENT')).toHaveLength(1)
    const sourcePosition = result.positions.find((p) => p.accountId === 'chk')!
    expect(sourcePosition.current).toBe(-20_000)
    expect(sourcePosition.usage.used).toBe(20_000)
    expect(sourcePosition.warnings.map((w) => w.code)).toContain('OVERDRAFT_USED')
    env.expectConsistent()
  })

  it('estourar o cheque especial avisa o excesso e não bloqueia', async () => {
    const env = makeCardsEnv()
    const statement = await closedStatement380(env)
    const result = await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk', // saldo 0, limite R$ 500,00
      amount: 38_000,
      date: day('2026-10-12'),
    })
    expect(result.overdraftWarning).toEqual({
      willUseOverdraft: true,
      usedAfter: 38_000,
      excessAfter: 0,
    })
    const other = await env.svc.payStatement(env.ctx, {
      statementId: (
        await env.svc.createCardPurchase(env.ctx, {
          accountId: 'card',
          amount: 90_000,
          date: day('2026-10-11'),
          description: 'Outra fatura',
        })
      ).statements[0]!.id,
      sourceAccountId: 'chk2', // sem limite
      amount: 90_000,
      date: day('2026-10-12'),
    })
    expect(other.overdraftWarning).toEqual({
      willUseOverdraft: true,
      usedAfter: 0,
      excessAfter: 90_000,
    })
    env.expectConsistent()
  })

  it('CA-05: pagar R$ 1,00 numa fatura PAID => STATEMENT_ALREADY_PAID', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)
    await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 38_000,
      date: day('2026-10-12'),
    })
    expect(
      await errorCodeOf(() =>
        env.svc.payStatement(env.ctx, {
          statementId: statement.id,
          sourceAccountId: 'chk',
          amount: 100,
          date: day('2026-10-12'),
        }),
      ),
    ).toBe('STATEMENT_ALREADY_PAID')
    env.expectConsistent()
  })

  it('CA-05: pagar mais que o aberto => STATEMENT_OVERPAYMENT (nada gravado)', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)
    const before = env.ledgerRepo.txns.size
    expect(
      await errorCodeOf(() =>
        env.svc.payStatement(env.ctx, {
          statementId: statement.id,
          sourceAccountId: 'chk',
          amount: 38_001,
          date: day('2026-10-12'),
        }),
      ),
    ).toBe('STATEMENT_OVERPAYMENT')
    expect(env.ledgerRepo.txns.size).toBe(before)
    // depois de um pagamento parcial, o limite é o que sobrou
    await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-12'),
    })
    expect(
      await errorCodeOf(() =>
        env.svc.payStatement(env.ctx, {
          statementId: statement.id,
          sourceAccountId: 'chk',
          amount: 18_001,
          date: day('2026-10-12'),
        }),
      ),
    ).toBe('STATEMENT_OVERPAYMENT')
  })

  it('CA-05: origem igual ao cartão ou outro cartão => INVALID_PAYMENT_SOURCE', async () => {
    const env = makeCardsEnv()
    const statement = await closedStatement380(env)
    const pay = (sourceAccountId: string) =>
      errorCodeOf(() =>
        env.svc.payStatement(env.ctx, {
          statementId: statement.id,
          sourceAccountId,
          amount: 1_000,
          date: day('2026-10-12'),
        }),
      )
    expect(await pay('card')).toBe('INVALID_PAYMENT_SOURCE')
    expect(await pay('card2')).toBe('INVALID_PAYMENT_SOURCE')
    expect(await pay('nao-existe')).toBe('ACCOUNT_NOT_FOUND')
    expect(await pay('other-chk')).toBe('ACCOUNT_NOT_FOUND')
    expect(await pay('old')).toBe('LEDGER_ACCOUNT_ARCHIVED')
  })

  it('pagamento com data futura grava as duas pernas PLANNED', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)
    const result = await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 38_000,
      date: day('2026-10-17'),
    })
    expect(env.ledgerRepo.txns.get(result.sourceTransactionId)!.status).toBe('PLANNED')
    expect(env.ledgerRepo.txns.get(result.cardTransactionId)!.status).toBe('PLANNED')
    expect(result.statement.status).toBe('PAID')
    env.expectConsistent()
  })

  it('fatura vencida e parcialmente paga é OVERDUE', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)
    env.setNow('2026-10-20')
    const result = await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 10_000,
      date: day('2026-10-20'),
    })
    expect(result.statement).toMatchObject({ open: 28_000, status: 'OVERDUE' })
  })

  it('valor inválido e fatura de outro usuário', async () => {
    const env = makeCardsEnv()
    const statement = await closedStatement380(env)
    expect(
      await errorCodeOf(() =>
        env.svc.payStatement(env.ctx, {
          statementId: statement.id,
          sourceAccountId: 'chk',
          amount: 0,
          date: day('2026-10-12'),
        }),
      ),
    ).toBe('INVALID_AMOUNT')
    expect(
      await errorCodeOf(() =>
        env.svc.payStatement(
          { userId: OTHER_USER },
          {
            statementId: statement.id,
            sourceAccountId: 'other-chk',
            amount: 100,
            date: day('2026-10-12'),
          },
        ),
      ),
    ).toBe('STATEMENT_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.payStatement(env.ctx, {
          statementId: 'nao-existe',
          sourceAccountId: 'chk',
          amount: 100,
          date: day('2026-10-12'),
        }),
      ),
    ).toBe('STATEMENT_NOT_FOUND')
  })

  it('atomicidade: falha ao atualizar a fatura desfaz o par no ledger', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)
    const txnsBefore = env.ledgerRepo.txns.size
    env.cardsRepo.failOn('updateStatementTotals', 1)
    await expect(
      env.svc.payStatement(env.ctx, {
        statementId: statement.id,
        sourceAccountId: 'chk',
        amount: 10_000,
        date: day('2026-10-12'),
      }),
    ).rejects.toThrow(/falha injetada/)
    expect(env.ledgerRepo.txns.size).toBe(txnsBefore)
    expect(env.ledgerRepo.balances.get('chk')!.balanceCleared).toBe(100_000)
    env.expectConsistent({ checkStatus: false })
  })

  it('pagamento de fatura não entra em receita/despesa (kind CARD_PAYMENT e excludeFromBudget)', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const statement = await closedStatement380(env)
    await env.svc.payStatement(env.ctx, {
      statementId: statement.id,
      sourceAccountId: 'chk',
      amount: 38_000,
      date: day('2026-10-12'),
    })
    const payments = [...env.ledgerRepo.txns.values()].filter((t) => t.kind === 'CARD_PAYMENT')
    expect(payments).toHaveLength(2)
    expect(payments.every((t) => t.excludeFromBudget)).toBe(true)
    // soma do par = 0 (dinheiro só muda de lugar)
    expect(payments.reduce((sum, t) => sum + t.amount, 0)).toBe(0)
  })
})
