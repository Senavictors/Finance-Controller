-- CreateTable
CREATE TABLE "dashboards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "w" INTEGER NOT NULL DEFAULT 6,
    "h" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboards_user_id_key" ON "dashboards"("user_id");

-- CreateIndex
CREATE INDEX "dashboard_widgets_dashboard_id_idx" ON "dashboard_widgets"("dashboard_id");

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
