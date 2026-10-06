-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('CHECKING', 'SAVINGS', 'WALLET', 'INVESTMENT', 'CREDIT_CARD', 'BUSINESS');

-- CreateEnum
CREATE TYPE "category_type" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "nature" AS ENUM ('MUST', 'NEED', 'WANT');

-- CreateEnum
CREATE TYPE "txn_kind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'CARD_PAYMENT', 'FEE', 'INTEREST', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "txn_status" AS ENUM ('PLANNED', 'PENDING', 'CLEARED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "review_state" AS ENUM ('NEEDS_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "txn_source" AS ENUM ('MANUAL', 'QUICKADD', 'IMPORT', 'BOT', 'RECURRING', 'OPEN_FINANCE');

-- CreateEnum
CREATE TYPE "category_source" AS ENUM ('USER', 'RULE', 'MERCHANT', 'LLM', 'PARSER', 'IMPORT');

-- CreateEnum
CREATE TYPE "series_kind" AS ENUM ('BILL', 'SUBSCRIPTION', 'INCOME', 'TRANSFER', 'LOAN_INSTALLMENT', 'TAX');

-- CreateEnum
CREATE TYPE "loan_kind" AS ENUM ('CONSIGNADO', 'PERSONAL', 'OVERDRAFT', 'CARD_REVOLVING', 'CARD_REFINANCE', 'PIX_CREDIT');

-- CreateEnum
CREATE TYPE "loan_system" AS ENUM ('PRICE');

-- CreateEnum
CREATE TYPE "loan_status" AS ENUM ('ACTIVE', 'PAID_OFF', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "installment_status" AS ENUM ('PENDING', 'PAID', 'SKIPPED');

-- CreateEnum
CREATE TYPE "statement_status" AS ENUM ('OPEN', 'CLOSED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "budget_bucket" AS ENUM ('FIXED', 'NON_MONTHLY', 'FLEX');

-- CreateEnum
CREATE TYPE "rule_stage" AS ENUM ('PRE', 'DEFAULT', 'POST');

-- CreateEnum
CREATE TYPE "rule_origin" AS ENUM ('USER', 'LEARNED');

-- CreateEnum
CREATE TYPE "import_kind" AS ENUM ('OFX', 'CSV', 'PDF_ITAU_EXTRATO', 'PDF_ITAU_FATURA', 'PDF_NUBANK_EXTRATO', 'PDF_NUBANK_FATURA');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'UNDONE');

-- CreateEnum
CREATE TYPE "goal_kind" AS ENUM ('RESERVE', 'PRIORITY', 'WISH', 'DEBT_PAYOFF');

-- CreateEnum
CREATE TYPE "goal_status" AS ENUM ('ACTIVE', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "recon_status" AS ENUM ('MATCHED', 'ADJUSTED', 'UNDONE');

-- CreateEnum
CREATE TYPE "cycle_mode" AS ENUM ('CALENDAR_MONTH', 'INCOME_CYCLE');

-- CreateEnum
CREATE TYPE "business_day_rule" AS ENUM ('NONE', 'NEXT_BUSINESS_DAY', 'PREVIOUS_BUSINESS_DAY');

-- CreateEnum
CREATE TYPE "additional_basis" AS ENUM ('PREVIOUS_MONTH', 'SAME_MONTH');

-- CreateEnum
CREATE TYPE "agent_run_status" AS ENUM ('RUNNING', 'OK', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "cycle_mode" "cycle_mode" NOT NULL DEFAULT 'INCOME_CYCLE',
    "cushion_cents" INTEGER NOT NULL DEFAULT 0,
    "ai_monthly_budget_micro_usd" INTEGER NOT NULL DEFAULT 1000000,
    "ai_total_budget_micro_usd" INTEGER NOT NULL DEFAULT 5000000,
    "privacy_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "account_type" NOT NULL,
    "issuer_key" TEXT,
    "network_key" TEXT,
    "color_key" TEXT,
    "icon" TEXT,
    "overdraft_limit" INTEGER NOT NULL DEFAULT 0,
    "credit_limit" INTEGER,
    "closing_day" INTEGER,
    "due_day" INTEGER,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_balances" (
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance_cleared" INTEGER NOT NULL DEFAULT 0,
    "balance_pending" INTEGER NOT NULL DEFAULT 0,
    "balance_planned" INTEGER NOT NULL DEFAULT 0,
    "last_entry_date" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_balances_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "as_of_date" TIMESTAMP(3) NOT NULL,
    "bank_balance" INTEGER NOT NULL,
    "ledger_balance" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "status" "recon_status" NOT NULL,
    "reconciled_count" INTEGER NOT NULL DEFAULT 0,
    "reconciled_ids" JSONB,
    "adjustment_transaction_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "category_type" NOT NULL,
    "nature" "nature",
    "icon" TEXT,
    "color_key" TEXT,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "aliases" TEXT[],
    "default_category_id" TEXT,
    "recent_category_ids" TEXT[],
    "nature" "nature",
    "default_account_id" TEXT,
    "brand_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "category_id" TEXT,
    "merchant_id" TEXT,
    "kind" "txn_kind" NOT NULL,
    "status" "txn_status" NOT NULL DEFAULT 'CLEARED',
    "review" "review_state" NOT NULL DEFAULT 'REVIEWED',
    "source" "txn_source" NOT NULL DEFAULT 'MANUAL',
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "posted_date" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "raw_description" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "transfer_id" TEXT,
    "refund_of_id" TEXT,
    "series_id" TEXT,
    "occurrence_key" TEXT,
    "statement_id" TEXT,
    "statement_key" TEXT,
    "import_batch_id" TEXT,
    "import_hash" TEXT,
    "category_source" "category_source",
    "ai_confidence" INTEGER,
    "user_locked" JSONB NOT NULL DEFAULT '{}',
    "exclude_from_budget" BOOLEAN NOT NULL DEFAULT false,
    "original_currency" VARCHAR(3),
    "original_amount" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_statements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "closing_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "statement_key" TEXT NOT NULL,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "paid_amount" INTEGER NOT NULL DEFAULT 0,
    "status" "statement_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "category_id" TEXT,
    "merchant_id" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_installment_advances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "advanced_at" TIMESTAMP(3) NOT NULL,
    "total_original_amount" INTEGER NOT NULL,
    "total_paid_amount" INTEGER NOT NULL,
    "total_discount_amount" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_installment_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_installments" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "advance_id" TEXT,
    "installment_number" INTEGER NOT NULL,
    "original_amount" INTEGER NOT NULL,
    "original_date" TIMESTAMP(3) NOT NULL,
    "ledger_transaction_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_series" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "series_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "to_account_id" TEXT,
    "category_id" TEXT,
    "merchant_id" TEXT,
    "amount" INTEGER NOT NULL,
    "amount_tolerance_pct" INTEGER NOT NULL DEFAULT 10,
    "day_tolerance" INTEGER NOT NULL DEFAULT 3,
    "rrule" TEXT NOT NULL,
    "dtstart" TIMESTAMP(3) NOT NULL,
    "until" TIMESTAMP(3),
    "auto_confirm" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "materialized_until" TIMESTAMP(3),
    "income_rule_id" TEXT,
    "loan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_cents" INTEGER NOT NULL,
    "per_day_cents" INTEGER NOT NULL,
    "weekdays" INTEGER[],
    "pay_day" INTEGER NOT NULL,
    "payment_adjust" "business_day_rule" NOT NULL DEFAULT 'NEXT_BUSINESS_DAY',
    "additional_basis" "additional_basis" NOT NULL DEFAULT 'PREVIOUS_MONTH',
    "destination_account_id" TEXT NOT NULL,
    "extra_days_off" TEXT[],
    "attendance_overrides" JSONB NOT NULL DEFAULT '{}',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mei_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3),
    "annual_ceiling_cents" INTEGER NOT NULL DEFAULT 8100000,
    "das_amount_cents" INTEGER NOT NULL,
    "das_due_day" INTEGER NOT NULL DEFAULT 20,
    "das_account_id" TEXT,
    "business_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mei_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mei_ledgers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "accumulated_cents" INTEGER NOT NULL,
    "proportional_ceiling_cents" INTEGER NOT NULL,
    "by_month" JSONB NOT NULL,
    "last_recomputed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mei_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "loan_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "lender_name" TEXT,
    "account_id" TEXT,
    "principal_cents" INTEGER NOT NULL,
    "monthly_rate" DECIMAL(9,6) NOT NULL,
    "installment_count" INTEGER,
    "installment_amount_cents" INTEGER,
    "first_due_date" TIMESTAMP(3),
    "contracted_at" TIMESTAMP(3),
    "system" "loan_system" NOT NULL DEFAULT 'PRICE',
    "outstanding_cents" INTEGER NOT NULL,
    "late_fee_pct" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "late_interest_monthly_pct" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "status" "loan_status" NOT NULL DEFAULT 'ACTIVE',
    "category_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_installments" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "principal_cents" INTEGER NOT NULL,
    "interest_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "installment_status" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "paid_amount_cents" INTEGER,
    "late_charges_cents" INTEGER NOT NULL DEFAULT 0,
    "transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_cycles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "flex_amount" INTEGER NOT NULL,
    "cushion" INTEGER NOT NULL,
    "expected_income" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "bucket" "budget_bucket" NOT NULL,
    "category_id" TEXT,
    "label" TEXT NOT NULL,
    "planned_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "rule_stage" NOT NULL DEFAULT 'DEFAULT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "origin" "rule_origin" NOT NULL DEFAULT 'USER',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "import_kind" NOT NULL,
    "account_id" TEXT,
    "file_sha256" TEXT NOT NULL,
    "file_label" TEXT,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "new_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "status" "import_status" NOT NULL DEFAULT 'PENDING',
    "error_log" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "goal_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "target_cents" INTEGER NOT NULL,
    "current_cents" INTEGER NOT NULL DEFAULT 0,
    "target_date" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "loan_id" TEXT,
    "category_id" TEXT,
    "status" "goal_status" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "status" "agent_run_status" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "summary" TEXT,
    "input" JSONB,
    "output" JSONB,
    "cost_micro_usd" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_micro_usd" INTEGER NOT NULL,
    "agent_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "username" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_key_created_at_idx" ON "login_attempts"("key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_is_archived_idx" ON "accounts"("user_id", "is_archived");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");

-- CreateIndex
CREATE INDEX "account_balances_user_id_idx" ON "account_balances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliations_adjustment_transaction_id_key" ON "reconciliations"("adjustment_transaction_id");

-- CreateIndex
CREATE INDEX "reconciliations_user_id_as_of_date_idx" ON "reconciliations"("user_id", "as_of_date" DESC);

-- CreateIndex
CREATE INDEX "reconciliations_account_id_as_of_date_idx" ON "reconciliations"("account_id", "as_of_date" DESC);

-- CreateIndex
CREATE INDEX "categories_user_id_parent_id_idx" ON "categories"("user_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_key_key" ON "categories"("user_id", "key");

-- CreateIndex
CREATE INDEX "merchants_aliases_idx" ON "merchants" USING GIN ("aliases");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_user_id_normalized_key_key" ON "merchants"("user_id", "normalized_key");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "transactions"("user_id", "date" DESC);

-- CreateIndex
CREATE INDEX "transactions_account_id_date_idx" ON "transactions"("account_id", "date" DESC);

-- CreateIndex
CREATE INDEX "transactions_account_id_status_idx" ON "transactions"("account_id", "status");

-- CreateIndex
CREATE INDEX "transactions_user_id_status_date_idx" ON "transactions"("user_id", "status", "date");

-- CreateIndex
CREATE INDEX "transactions_user_id_review_idx" ON "transactions"("user_id", "review");

-- CreateIndex
CREATE INDEX "transactions_category_id_date_idx" ON "transactions"("category_id", "date");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_idx" ON "transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "transactions_statement_id_idx" ON "transactions"("statement_id");

-- CreateIndex
CREATE INDEX "transactions_series_id_date_idx" ON "transactions"("series_id", "date");

-- CreateIndex
CREATE INDEX "transactions_transfer_id_idx" ON "transactions"("transfer_id");

-- CreateIndex
CREATE INDEX "transactions_import_batch_id_idx" ON "transactions"("import_batch_id");

-- CreateIndex
CREATE INDEX "transactions_tags_idx" ON "transactions" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_import_hash_key" ON "transactions"("user_id", "import_hash");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_occurrence_key_key" ON "transactions"("user_id", "occurrence_key");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_transfer_id_account_id_key" ON "transactions"("transfer_id", "account_id");

-- CreateIndex
CREATE INDEX "credit_card_statements_user_id_due_date_idx" ON "credit_card_statements"("user_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_statements_account_id_period_start_key" ON "credit_card_statements"("account_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_statements_account_id_statement_key_key" ON "credit_card_statements"("account_id", "statement_key");

-- CreateIndex
CREATE INDEX "card_purchases_user_id_purchase_date_idx" ON "card_purchases"("user_id", "purchase_date" DESC);

-- CreateIndex
CREATE INDEX "card_purchases_account_id_idx" ON "card_purchases"("account_id");

-- CreateIndex
CREATE INDEX "card_installment_advances_user_id_advanced_at_idx" ON "card_installment_advances"("user_id", "advanced_at" DESC);

-- CreateIndex
CREATE INDEX "card_installment_advances_purchase_id_idx" ON "card_installment_advances"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_installments_ledger_transaction_id_key" ON "card_installments"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "card_installments_advance_id_idx" ON "card_installments"("advance_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_installments_purchase_id_installment_number_key" ON "card_installments"("purchase_id", "installment_number");

-- CreateIndex
CREATE INDEX "recurring_series_user_id_is_active_idx" ON "recurring_series"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "income_rules_user_id_is_active_idx" ON "income_rules"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "mei_profiles_user_id_key" ON "mei_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mei_ledgers_user_id_year_key" ON "mei_ledgers"("user_id", "year");

-- CreateIndex
CREATE INDEX "loans_user_id_status_idx" ON "loans"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "loan_installments_transaction_id_key" ON "loan_installments"("transaction_id");

-- CreateIndex
CREATE INDEX "loan_installments_due_date_idx" ON "loan_installments"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "loan_installments_loan_id_number_key" ON "loan_installments"("loan_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "budget_cycles_user_id_start_date_key" ON "budget_cycles"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "budget_lines_cycle_id_idx" ON "budget_lines"("cycle_id");

-- CreateIndex
CREATE INDEX "rules_user_id_stage_priority_idx" ON "rules"("user_id", "stage", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_user_id_file_sha256_key" ON "import_batches"("user_id", "file_sha256");

-- CreateIndex
CREATE INDEX "goals_user_id_status_idx" ON "goals"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memories_user_id_key_key" ON "memories"("user_id", "key");

-- CreateIndex
CREATE INDEX "agent_runs_user_id_agent_started_at_idx" ON "agent_runs"("user_id", "agent", "started_at" DESC);

-- CreateIndex
CREATE INDEX "ai_usages_user_id_created_at_idx" ON "ai_usages"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_user_id_key" ON "telegram_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_chat_id_key" ON "telegram_links"("chat_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_adjustment_transaction_id_fkey" FOREIGN KEY ("adjustment_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_refund_of_id_fkey" FOREIGN KEY ("refund_of_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "recurring_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "credit_card_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_installment_advances" ADD CONSTRAINT "card_installment_advances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_installment_advances" ADD CONSTRAINT "card_installment_advances_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "card_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_installment_advances" ADD CONSTRAINT "card_installment_advances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_installments" ADD CONSTRAINT "card_installments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "card_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_installments" ADD CONSTRAINT "card_installments_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "card_installment_advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_installments" ADD CONSTRAINT "card_installments_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_income_rule_id_fkey" FOREIGN KEY ("income_rule_id") REFERENCES "income_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_rules" ADD CONSTRAINT "income_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_rules" ADD CONSTRAINT "income_rules_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mei_profiles" ADD CONSTRAINT "mei_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mei_profiles" ADD CONSTRAINT "mei_profiles_das_account_id_fkey" FOREIGN KEY ("das_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mei_profiles" ADD CONSTRAINT "mei_profiles_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mei_ledgers" ADD CONSTRAINT "mei_ledgers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "budget_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- CHECK constraints (SQL manual; o Prisma não modela CHECK)
-- ============================================================================

-- Lançamento nunca tem valor zero (assinado: positivo entra, negativo sai).
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_nonzero" CHECK ("amount" <> 0);

-- Transferência e pagamento de fatura são pares ligados por transfer_id (ADR-004).
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pair_requires_transfer_id"
  CHECK (("kind" NOT IN ('TRANSFER','CARD_PAYMENT')) OR "transfer_id" IS NOT NULL);

-- Limite de cheque especial nunca negativo.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_overdraft_nonneg" CHECK ("overdraft_limit" >= 0);

-- Dias de fechamento e vencimento do cartão entre 1 e 31.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_days_range"
  CHECK (("closing_day" IS NULL OR "closing_day" BETWEEN 1 AND 31) AND ("due_day" IS NULL OR "due_day" BETWEEN 1 AND 31));

-- Dia de pagamento da renda entre 1 e 31.
ALTER TABLE "income_rules" ADD CONSTRAINT "income_rules_pay_day_range" CHECK ("pay_day" BETWEEN 1 AND 31);
