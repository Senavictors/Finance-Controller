import { prisma } from '@/server/db'
import type { CreateGoalInput, UpdateGoalInput } from '../../http/schemas'
import { calculateGoalProgress } from './calculate-progress'
import type { GoalProgressResult } from './types'

export async function createGoal(input: CreateGoalInput, userId: string) {
  return prisma.goal.create({
    data: { ...input, userId },
  })
}

export async function updateGoal(goalId: string, input: UpdateGoalInput, userId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) throw new Error('Meta nao encontrada')

  return prisma.goal.update({ where: { id: goalId }, data: input })
}

export async function archiveGoal(goalId: string, userId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) throw new Error('Meta nao encontrada')

  return prisma.goal.update({ where: { id: goalId }, data: { isActive: false } })
}

export async function listGoals(userId: string) {
  return prisma.goal.findMany({
    where: { userId, isActive: true },
    include: {
      category: { select: { id: true, name: true, color: true } },
      account: { select: { id: true, name: true, color: true, type: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function listGoalsWithProgress(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<GoalProgressResult[]> {
  const goals = await listGoals(userId)

  return Promise.all(goals.map((goal) => calculateGoalProgress(goal.id, userId, monthParam, now)))
}
