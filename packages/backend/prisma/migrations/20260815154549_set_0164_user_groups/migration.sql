-- CreateTable
CREATE TABLE "user_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group_scope_grants" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "scope_type" "MembershipScopeType" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_scope_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_group_members_account_id_idx" ON "user_group_members"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_group_members_group_id_account_id_key" ON "user_group_members"("group_id", "account_id");

-- CreateIndex
CREATE INDEX "user_group_scope_grants_scope_type_scope_id_idx" ON "user_group_scope_grants"("scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_group_scope_grants_group_id_scope_type_scope_id_key" ON "user_group_scope_grants"("group_id", "scope_type", "scope_id");

-- AddForeignKey
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_scope_grants" ADD CONSTRAINT "user_group_scope_grants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
