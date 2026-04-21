-- CreateEnum
CREATE TYPE "wishlist_item_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "wishlist_item_status" AS ENUM ('DESIRED', 'MONITORING', 'READY_TO_BUY', 'PURCHASED', 'CANCELED');

-- CreateTable
CREATE TABLE "wishlist_categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "desired_price" INTEGER NOT NULL,
    "paid_price" INTEGER,
    "product_url" TEXT,
    "priority" "wishlist_item_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "wishlist_item_status" NOT NULL DEFAULT 'DESIRED',
    "desired_purchase_date" TIMESTAMP(3),
    "purchased_at" TIMESTAMP(3),
    "purchase_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_categories_user_id_name_key" ON "wishlist_categories"("user_id", "name");

-- CreateIndex
CREATE INDEX "wishlist_categories_user_id_idx" ON "wishlist_categories"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_purchase_transaction_id_key" ON "wishlist_items"("purchase_transaction_id");

-- CreateIndex
CREATE INDEX "wishlist_items_user_id_idx" ON "wishlist_items"("user_id");

-- CreateIndex
CREATE INDEX "wishlist_items_user_id_status_idx" ON "wishlist_items"("user_id", "status");

-- CreateIndex
CREATE INDEX "wishlist_items_category_id_idx" ON "wishlist_items"("category_id");

-- AddForeignKey
ALTER TABLE "wishlist_categories" ADD CONSTRAINT "wishlist_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "wishlist_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_purchase_transaction_id_fkey" FOREIGN KEY ("purchase_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
