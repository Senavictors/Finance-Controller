-- CreateEnum
CREATE TYPE "goal_metric" AS ENUM ('SAVING', 'EXPENSE_LIMIT', 'INCOME_TARGET', 'ACCOUNT_LIMIT');

-- CreateEnum
CREATE TYPE "goal_scope_type" AS ENUM ('GLOBAL', 'CATEGORY', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "goal_period" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "goal_status" AS ENUM ('ON_TRACK', 'WARNING', 'AT_RISK', 'ACHIEVED', 'EXCEEDED');

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" "goal_metric" NOT NULL,
    "scope_type" "goal_scope_type" NOT NULL DEFAULT 'GLOBAL',
    "category_id" TEXT,
    "account_id" TEXT,
    "target_amount" INTEGER NOT NULL,
    "period" "goal_period" NOT NULL DEFAULT 'MONTHLY',
    "warning_percent" INTEGER NOT NULL DEFAULT 80,
    "danger_percent" INTEGER NOT NULL DEFAULT 95,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_snapshots" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "actual_amount" INTEGER NOT NULL,
    "projected_amount" INTEGER NOT NULL,
    "progress_percent" INTEGER NOT NULL,
    "status" "goal_status" NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- CreateIndex
CREATE INDEX "goal_snapshots_goal_id_idx" ON "goal_snapshots"("goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "goal_snapshots_goal_id_period_start_key" ON "goal_snapshots"("goal_id", "period_start");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_snapshots" ADD CONSTRAINT "goal_snapshots_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
