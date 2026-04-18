-- CreateEnum
CREATE TYPE "financial_score_status" AS ENUM ('CRITICAL', 'ATTENTION', 'GOOD', 'EXCELLENT');

-- CreateTable
CREATE TABLE "financial_score_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "financial_score_status" NOT NULL,
    "factors" JSONB NOT NULL,
    "insights" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_at" TIMESTAMP(3),

    CONSTRAINT "financial_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_score_snapshots_user_id_idx" ON "financial_score_snapshots"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_score_snapshots_user_id_period_start_key" ON "financial_score_snapshots"("user_id", "period_start");

-- AddForeignKey
ALTER TABLE "financial_score_snapshots" ADD CONSTRAINT "financial_score_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
