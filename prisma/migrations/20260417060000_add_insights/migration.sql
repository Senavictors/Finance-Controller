-- CreateEnum
CREATE TYPE "insight_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "insight_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "insight_severity" NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT,
    "cta" JSONB,
    "payload" JSONB NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insight_snapshots_user_id_idx" ON "insight_snapshots"("user_id");

-- CreateIndex
CREATE INDEX "insight_snapshots_user_id_period_start_idx" ON "insight_snapshots"("user_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "insight_snapshots_user_id_period_start_fingerprint_key" ON "insight_snapshots"("user_id", "period_start", "fingerprint");

-- AddForeignKey
ALTER TABLE "insight_snapshots" ADD CONSTRAINT "insight_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
