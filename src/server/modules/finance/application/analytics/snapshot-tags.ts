export const ANALYTICS_SNAPSHOT_MODULES = [
  'summary',
  'goals',
  'forecast',
  'score',
  'insights',
  'credit-card',
] as const

export type AnalyticsSnapshotModule = (typeof ANALYTICS_SNAPSHOT_MODULES)[number]

export type AnalyticsEntityScope = 'account' | 'category' | 'statement'

export function getAnalyticsRootTag() {
  return 'analytics'
}

export function getAnalyticsUserTag(userId: string) {
  return `${getAnalyticsRootTag()}:user:${userId}`
}

export function getAnalyticsModuleTag({
  userId,
  module,
}: {
  userId: string
  module: AnalyticsSnapshotModule
}) {
  return `${getAnalyticsUserTag(userId)}:module:${module}`
}

export function getAnalyticsMonthTag({
  userId,
  module,
  monthKey,
}: {
  userId: string
  module: AnalyticsSnapshotModule
  monthKey: string
}) {
  return `${getAnalyticsModuleTag({ userId, module })}:month:${monthKey}`
}

export function getAnalyticsEntityTag({
  userId,
  scope,
  id,
}: {
  userId: string
  scope: AnalyticsEntityScope
  id: string
}) {
  return `${getAnalyticsUserTag(userId)}:${scope}:${id}`
}
