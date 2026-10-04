-- CreateTable
CREATE TABLE "user_favorites" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_ref" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_favorites_account_id_sort_order_idx" ON "user_favorites"("account_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorites_account_id_kind_target_ref_key" ON "user_favorites"("account_id", "kind", "target_ref");

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
