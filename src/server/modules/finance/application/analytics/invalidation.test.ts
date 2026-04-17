import { describe, expect, it } from 'vitest'
import { ANALYTICS_MUTATION_MODULES, getAnalyticsInvalidationTags } from './invalidation'

describe('analytics/invalidation', () => {
  it('gera tags por usuario, modulo, mes e entidades afetadas', () => {
    const tags = getAnalyticsInvalidationTags({
      userId: 'user-1',
      modules: ANALYTICS_MUTATION_MODULES.transaction,
      dates: ['2026-04-18T12:00:00.000Z', '2026-05-02T09:30:00.000Z'],
      accountIds: ['acc-checking', 'acc-card', 'acc-checking'],
      categoryIds: ['cat-food'],
      statementIds: ['statement-1'],
    })

    expect(tags).toContain('analytics')
    expect(tags).toContain('analytics:user:user-1')
    expect(tags).toContain('analytics:user:user-1:module:summary')
    expect(tags).toContain('analytics:user:user-1:module:credit-card')
    expect(tags).toContain('analytics:user:user-1:module:summary:month:2026-04')
    expect(tags).toContain('analytics:user:user-1:module:forecast:month:2026-05')
    expect(tags).toContain('analytics:user:user-1:account:acc-checking')
    expect(tags).toContain('analytics:user:user-1:account:acc-card')
    expect(tags).toContain('analytics:user:user-1:category:cat-food')
    expect(tags).toContain('analytics:user:user-1:statement:statement-1')
  })

  it('ignora datas invalidas e ids nulos', () => {
    const tags = getAnalyticsInvalidationTags({
      userId: 'user-1',
      modules: ['summary'],
      dates: ['invalid-date', null, undefined],
      accountIds: [null, undefined],
      categoryIds: [undefined],
      statementIds: [null],
    })

    expect(tags).toEqual([
      'analytics',
      'analytics:user:user-1',
      'analytics:user:user-1:module:summary',
    ])
  })
})
