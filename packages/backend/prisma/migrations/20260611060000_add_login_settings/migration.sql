-- CreateTable
CREATE TABLE "password_policies" (
    "id" TEXT NOT NULL,
    "require_lowercase" BOOLEAN NOT NULL DEFAULT true,
    "require_uppercase" BOOLEAN NOT NULL DEFAULT true,
    "require_number" BOOLEAN NOT NULL DEFAULT true,
    "require_symbol" BOOLEAN NOT NULL DEFAULT false,
    "min_length" INTEGER NOT NULL DEFAULT 8,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "password_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_whitelist_entries" (
    "id" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_whitelist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ip_whitelist_entries_sort_order_idx" ON "ip_whitelist_entries"("sort_order");
