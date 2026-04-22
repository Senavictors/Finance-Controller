-- CreateEnum
CREATE TYPE "credit_card_purchase_source" AS ENUM ('MANUAL', 'WISHLIST');

-- CreateTable
CREATE TABLE "credit_card_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "category_id" TEXT,
    "wishlist_item_id" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "source" "credit_card_purchase_source" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_installment_advances" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "advanced_at" TIMESTAMP(3) NOT NULL,
    "total_original_amount" INTEGER NOT NULL,
    "total_paid_amount" INTEGER NOT NULL,
    "total_discount_amount" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_installment_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_purchase_installments" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "advance_id" TEXT,
    "installment_number" INTEGER NOT NULL,
    "original_amount" INTEGER NOT NULL,
    "original_date" TIMESTAMP(3) NOT NULL,
    "ledger_transaction_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_purchase_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_purchases_wishlist_item_id_key" ON "credit_card_purchases"("wishlist_item_id");

-- CreateIndex
CREATE INDEX "credit_card_purchases_user_id_idx" ON "credit_card_purchases"("user_id");

-- CreateIndex
CREATE INDEX "credit_card_purchases_account_id_idx" ON "credit_card_purchases"("account_id");

-- CreateIndex
CREATE INDEX "credit_card_purchases_category_id_idx" ON "credit_card_purchases"("category_id");

-- CreateIndex
CREATE INDEX "credit_card_purchases_purchase_date_idx" ON "credit_card_purchases"("purchase_date");

-- CreateIndex
CREATE INDEX "credit_card_installment_advances_purchase_id_idx" ON "credit_card_installment_advances"("purchase_id");

-- CreateIndex
CREATE INDEX "credit_card_installment_advances_user_id_idx" ON "credit_card_installment_advances"("user_id");

-- CreateIndex
CREATE INDEX "credit_card_installment_advances_account_id_idx" ON "credit_card_installment_advances"("account_id");

-- CreateIndex
CREATE INDEX "credit_card_installment_advances_advanced_at_idx" ON "credit_card_installment_advances"("advanced_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_purchase_installments_purchase_id_installment_number_key" ON "credit_card_purchase_installments"("purchase_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_purchase_installments_ledger_transaction_id_key" ON "credit_card_purchase_installments"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "credit_card_purchase_installments_purchase_id_idx" ON "credit_card_purchase_installments"("purchase_id");

-- CreateIndex
CREATE INDEX "credit_card_purchase_installments_advance_id_idx" ON "credit_card_purchase_installments"("advance_id");

-- CreateIndex
CREATE INDEX "credit_card_purchase_installments_original_date_idx" ON "credit_card_purchase_installments"("original_date");

-- AddForeignKey
ALTER TABLE "credit_card_purchases"
ADD CONSTRAINT "credit_card_purchases_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchases"
ADD CONSTRAINT "credit_card_purchases_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchases"
ADD CONSTRAINT "credit_card_purchases_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchases"
ADD CONSTRAINT "credit_card_purchases_wishlist_item_id_fkey"
FOREIGN KEY ("wishlist_item_id") REFERENCES "wishlist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_installment_advances"
ADD CONSTRAINT "credit_card_installment_advances_purchase_id_fkey"
FOREIGN KEY ("purchase_id") REFERENCES "credit_card_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_installment_advances"
ADD CONSTRAINT "credit_card_installment_advances_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_installment_advances"
ADD CONSTRAINT "credit_card_installment_advances_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchase_installments"
ADD CONSTRAINT "credit_card_purchase_installments_purchase_id_fkey"
FOREIGN KEY ("purchase_id") REFERENCES "credit_card_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchase_installments"
ADD CONSTRAINT "credit_card_purchase_installments_advance_id_fkey"
FOREIGN KEY ("advance_id") REFERENCES "credit_card_installment_advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchase_installments"
ADD CONSTRAINT "credit_card_purchase_installments_ledger_transaction_id_fkey"
FOREIGN KEY ("ledger_transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
