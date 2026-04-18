import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { buildInsightMetrics } from './build-metrics'
import { dedupeInsights, runInsightRules } from './rules'
import type { InsightCandidate, InsightRecord } from './types'

const MAX_INSIGHTS_PER_PERIOD = 8

export async function runInsights(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<{ candidates: InsightCandidate[]; periodStart: Date; periodEnd: Date }> {
  const metrics = await buildInsightMetrics(userId, monthParam, now)
  const raw = runInsightRules(metrics)
  const candidates = dedupeInsights(raw).slice(0, MAX_INSIGHTS_PER_PERIOD)
  return { candidates, periodStart: metrics.periodStart, periodEnd: metrics.periodEnd }
}

export async function refreshInsightSnapshots(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<InsightRecord[]> {
  const { candidates, periodStart, periodEnd } = await runInsights(userId, monthParam, now)

  const existing = await prisma.insightSnapshot.findMany({
    where: { userId, periodStart },
    select: {
      id: true,
      fingerprint: true,
      isDismissed: true,
      createdAt: true,
    },
  })
  const existingMap = new Map(existing.map((row) => [row.fingerprint, row]))
  const keepFingerprints = new Set(candidates.map((c) => c.fingerprint))

  const toRemove = existing
    .filter((row) => !keepFingerprints.has(row.fingerprint) && !row.isDismissed)
    .map((row) => row.id)
  if (toRemove.length > 0) {
    await prisma.insightSnapshot.deleteMany({ where: { id: { in: toRemove } } })
  }

  const results: InsightRecord[] = []
  for (const candidate of candidates) {
    const prior = existingMap.get(candidate.fingerprint)
    const saved = await prisma.insightSnapshot.upsert({
      where: {
        userId_periodStart_fingerprint: {
          userId,
          periodStart,
          fingerprint: candidate.fingerprint,
        },
      },
      create: {
        userId,
        key: candidate.key,
        title: candidate.title,
        body: candidate.body,
        severity: candidate.severity,
        scopeType: candidate.scopeType,
        scopeId: candidate.scopeId ?? null,
        cta: (candidate.cta ?? null) as Prisma.InputJsonValue,
        payload: candidate.payload as Prisma.InputJsonValue,
        periodStart,
        periodEnd,
        fingerprint: candidate.fingerprint,
        priority: candidate.priority,
      },
      update: {
        key: candidate.key,
        title: candidate.title,
        body: candidate.body,
        severity: candidate.severity,
        scopeType: candidate.scopeType,
        scopeId: candidate.scopeId ?? null,
        cta: (candidate.cta ?? null) as Prisma.InputJsonValue,
        payload: candidate.payload as Prisma.InputJsonValue,
        periodEnd,
        priority: candidate.priority,
      },
    })

    results.push({
      ...candidate,
      id: saved.id,
      isDismissed: prior?.isDismissed ?? saved.isDismissed,
      periodStart,
      periodEnd,
      createdAt: saved.createdAt,
    })
  }

  return results
}

export async function listInsights(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<InsightRecord[]> {
  const { candidates, periodStart, periodEnd } = await runInsights(userId, monthParam, now)

  const existing = await prisma.insightSnapshot.findMany({
    where: { userId, periodStart },
    select: { id: true, fingerprint: true, isDismissed: true, createdAt: true },
  })
  const byFingerprint = new Map(existing.map((row) => [row.fingerprint, row]))

  return candidates.map((candidate) => {
    const prior = byFingerprint.get(candidate.fingerprint)
    return {
      ...candidate,
      id: prior?.id ?? '',
      isDismissed: prior?.isDismissed ?? false,
      periodStart,
      periodEnd,
      createdAt: prior?.createdAt ?? new Date(),
    }
  })
}

export async function dismissInsight(insightId: string, userId: string): Promise<void> {
  const insight = await prisma.insightSnapshot.findFirst({
    where: { id: insightId, userId },
    select: { id: true },
  })
  if (!insight) throw new Error('Insight nao encontrado')
  await prisma.insightSnapshot.update({
    where: { id: insightId },
    data: { isDismissed: true },
  })
}
