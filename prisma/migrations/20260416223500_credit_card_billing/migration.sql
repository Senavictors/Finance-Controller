-- CreateEnum
CREATE TYPE "credit_card_statement_status" AS ENUM ('OPEN', 'CLOSED', 'PAID', 'OVERDUE');

-- AlterTable
ALTER TABLE "accounts"
ADD COLUMN "credit_limit" INTEGER,
ADD COLUMN "statement_closing_day" INTEGER,
ADD COLUMN "statement_due_day" INTEGER;

-- AlterTable
ALTER TABLE "transactions"
ADD COLUMN "credit_card_statement_id" TEXT;

-- CreateTable
CREATE TABLE "credit_card_statements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "closing_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "paid_amount" INTEGER NOT NULL DEFAULT 0,
    "status" "credit_card_statement_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_credit_card_statement_id_idx" ON "transactions"("credit_card_statement_id");

-- CreateIndex
CREATE INDEX "credit_card_statements_user_id_idx" ON "credit_card_statements"("user_id");

-- CreateIndex
CREATE INDEX "credit_card_statements_account_id_idx" ON "credit_card_statements"("account_id");

-- CreateIndex
CREATE INDEX "credit_card_statements_due_date_idx" ON "credit_card_statements"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_statements_account_id_period_start_key" ON "credit_card_statements"("account_id", "period_start");

-- AddForeignKey
ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_credit_card_statement_id_fkey"
FOREIGN KEY ("credit_card_statement_id") REFERENCES "credit_card_statements"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_statements"
ADD CONSTRAINT "credit_card_statements_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_statements"
ADD CONSTRAINT "credit_card_statements_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
