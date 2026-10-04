-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "badge_color" TEXT NOT NULL DEFAULT 'none',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_rete" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_systems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_systems_sort_order_idx" ON "tenant_systems"("sort_order");

