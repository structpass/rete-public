-- CreateTable
CREATE TABLE "desk_group_classifications" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "desk_group_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_groups" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classification_id" TEXT,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "desk_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desk_group_members" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "target_ref" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "desk_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "desk_group_classifications_account_id_sort_order_idx" ON "desk_group_classifications"("account_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "desk_group_classifications_account_id_name_key" ON "desk_group_classifications"("account_id", "name");

-- CreateIndex
CREATE INDEX "desk_groups_account_id_classification_id_sort_order_idx" ON "desk_groups"("account_id", "classification_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "desk_groups_account_id_name_key" ON "desk_groups"("account_id", "name");

-- CreateIndex
CREATE INDEX "desk_group_members_group_id_sort_order_idx" ON "desk_group_members"("group_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "desk_group_members_account_id_target_ref_key" ON "desk_group_members"("account_id", "target_ref");

-- AddForeignKey
ALTER TABLE "desk_group_classifications" ADD CONSTRAINT "desk_group_classifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_groups" ADD CONSTRAINT "desk_groups_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_groups" ADD CONSTRAINT "desk_groups_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "desk_group_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_group_members" ADD CONSTRAINT "desk_group_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desk_group_members" ADD CONSTRAINT "desk_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "desk_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
