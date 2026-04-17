-- CreateEnum
CREATE TYPE "forecast_risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "forecast_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "reference_date" TIMESTAMP(3) NOT NULL,
    "actual_income" INTEGER NOT NULL,
    "actual_expenses" INTEGER NOT NULL,
    "projected_recurring_income" INTEGER NOT NULL,
    "projected_recurring_expenses" INTEGER NOT NULL,
    "projected_variable_income" INTEGER NOT NULL,
    "projected_variable_expenses" INTEGER NOT NULL,
    "predicted_balance" INTEGER NOT NULL,
    "risk_level" "forecast_risk_level" NOT NULL,
    "assumptions" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_at" TIMESTAMP(3),

    CONSTRAINT "forecast_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forecast_snapshots_user_id_idx" ON "forecast_snapshots"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_snapshots_user_id_period_start_key" ON "forecast_snapshots"("user_id", "period_start");

-- AddForeignKey
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
