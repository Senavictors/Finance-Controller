import { describe, expect, it, vi } from 'vitest'

const { revalidateTagMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
}))

import { invalidateAnalyticsSnapshots } from './invalidation'

describe('analytics/invalidation runtime', () => {
  it('ignores missing static generation store outside the Next request context', async () => {
    revalidateTagMock.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in revalidateTag analytics')
    })

    await expect(
      invalidateAnalyticsSnapshots({
        userId: 'user-1',
        modules: ['summary'],
        dates: [new Date('2026-04-21T12:00:00.000Z')],
      }),
    ).resolves.toContain('analytics:user:user-1:module:summary')
  })
})
