import { revalidateTag } from 'next/cache'
import {
  ANALYTICS_SNAPSHOT_MODULES,
  getAnalyticsEntityTag,
  getAnalyticsModuleTag,
  getAnalyticsMonthTag,
  getAnalyticsRootTag,
  getAnalyticsUserTag,
  type AnalyticsSnapshotModule,
} from './snapshot-tags'

type MaybeDate = Date | string | null | undefined
type MaybeId = string | null | undefined

export const ANALYTICS_MUTATION_MODULES = {
  transaction: ['summary', 'goals', 'forecast', 'score', 'insights', 'credit-card'],
  transfer: ['summary', 'forecast', 'score', 'insights', 'credit-card'],
  recurringRule: ['goals', 'forecast', 'score', 'insights'],
  account: ['summary', 'goals', 'forecast', 'score', 'insights', 'credit-card'],
  category: ['summary', 'goals', 'forecast', 'score', 'insights'],
  creditCardPayment: ['summary', 'forecast', 'score', 'insights', 'credit-card'],
  fullRebuild: ANALYTICS_SNAPSHOT_MODULES,
} satisfies Record<string, readonly AnalyticsSnapshotModule[]>

export type AnalyticsInvalidationContext = {
  userId: string
  modules?: readonly AnalyticsSnapshotModule[]
  dates?: MaybeDate[]
  accountIds?: MaybeId[]
  categoryIds?: MaybeId[]
  statementIds?: MaybeId[]
}

function toMonthKey(value: MaybeDate) {
  if (!value) return null

  const date = value instanceof Date ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function compactUnique<T>(values: ReadonlyArray<T | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is T => value != null)))
}

export function getAnalyticsInvalidationTags({
  userId,
  modules = ANALYTICS_SNAPSHOT_MODULES,
  dates = [],
  accountIds = [],
  categoryIds = [],
  statementIds = [],
}: AnalyticsInvalidationContext) {
  const monthKeys = compactUnique(dates.map(toMonthKey))
  const resolvedModules = compactUnique(modules)
  const tags = new Set<string>([getAnalyticsRootTag(), getAnalyticsUserTag(userId)])

  for (const moduleName of resolvedModules) {
    tags.add(getAnalyticsModuleTag({ userId, module: moduleName }))

    for (const monthKey of monthKeys) {
      tags.add(getAnalyticsMonthTag({ userId, module: moduleName, monthKey }))
    }
  }

  for (const accountId of compactUnique(accountIds)) {
    tags.add(
      getAnalyticsEntityTag({
        userId,
        scope: 'account',
        id: accountId,
      }),
    )
  }

  for (const categoryId of compactUnique(categoryIds)) {
    tags.add(
      getAnalyticsEntityTag({
        userId,
        scope: 'category',
        id: categoryId,
      }),
    )
  }

  for (const statementId of compactUnique(statementIds)) {
    tags.add(
      getAnalyticsEntityTag({
        userId,
        scope: 'statement',
        id: statementId,
      }),
    )
  }

  return Array.from(tags)
}

export async function invalidateAnalyticsSnapshots(context: AnalyticsInvalidationContext) {
  const tags = getAnalyticsInvalidationTags(context)

  for (const tag of tags) {
    revalidateTag(tag, 'max')
  }

  return tags
}
