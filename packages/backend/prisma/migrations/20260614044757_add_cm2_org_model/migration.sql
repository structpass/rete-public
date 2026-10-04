-- CreateEnum
CREATE TYPE "SpaceKind" AS ENUM ('CHANNEL', 'GROUP', 'PERSONAL_MEMO', 'PERSONAL_DM');

-- CreateEnum
CREATE TYPE "MembershipScopeType" AS ENUM ('ORGANIZATION', 'PROJECT', 'GROUP');

-- AlterTable
ALTER TABLE "chat_themes" ADD COLUMN     "space_id" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "space_id" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "kind" "SpaceKind" NOT NULL,
    "project_id" TEXT,
    "owner_id" TEXT,
    "peer_account_id" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "scope_type" "MembershipScopeType" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_sort_order_idx" ON "organizations"("sort_order");

-- CreateIndex
CREATE INDEX "projects_organization_id_sort_order_idx" ON "projects"("organization_id", "sort_order");

-- CreateIndex
CREATE INDEX "spaces_project_id_sort_order_idx" ON "spaces"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "spaces_owner_id_idx" ON "spaces"("owner_id");

-- CreateIndex
CREATE INDEX "spaces_peer_account_id_idx" ON "spaces"("peer_account_id");

-- CreateIndex
CREATE INDEX "memberships_scope_type_scope_id_idx" ON "memberships"("scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "memberships_account_id_idx" ON "memberships"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_account_id_scope_type_scope_id_key" ON "memberships"("account_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "chat_themes_space_id_last_message_at_idx" ON "chat_themes"("space_id", "last_message_at");

-- CreateIndex
CREATE INDEX "tasks_space_id_category_id_parent_task_id_sort_order_idx" ON "tasks"("space_id", "category_id", "parent_task_id", "sort_order");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_peer_account_id_fkey" FOREIGN KEY ("peer_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_themes" ADD CONSTRAINT "chat_themes_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- MANUAL: 判別共用体 CHECK（kind ごとの列 shape）— ADR 0037 / space_kind_shape
-- prisma schema では表現不可。db push / baseline 再採番では脱落し得るので本 migration を参照
-- （先例 reaction_target_xor / attachment_target_xor と同じ手書き運用）。
-- ============================================================
ALTER TABLE "spaces" ADD CONSTRAINT space_kind_shape CHECK (
  (kind = 'CHANNEL'       AND project_id IS NOT NULL AND owner_id IS NULL     AND peer_account_id IS NULL)     OR
  (kind = 'GROUP'         AND project_id IS NULL     AND owner_id IS NULL     AND peer_account_id IS NULL)     OR
  (kind = 'PERSONAL_MEMO' AND project_id IS NULL     AND owner_id IS NOT NULL AND peer_account_id IS NULL)     OR
  (kind = 'PERSONAL_DM'   AND project_id IS NULL     AND owner_id IS NOT NULL AND peer_account_id IS NOT NULL)
);

-- ============================================================
-- MANUAL: 移行②（spec §8 / ADR 0037）— デフォルト器の作成と既存データの収容
-- 固定 ID は @rete/shared の DEFAULT_ORG_ID / DEFAULT_PROJECT_ID / DEFAULT_CHANNEL_ID と完全一致させること。
-- 本番既存 DB は seed の skip-if-exists ガードに届かないため backfill は migration の責務（critical review 指摘3）。
-- ============================================================
INSERT INTO "organizations" ("id", "name", "sort_order", "created_at", "updated_at")
VALUES ('00000000-0000-4000-b000-000000000001', 'デフォルト組織', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "projects" ("id", "organization_id", "name", "sort_order", "created_at", "updated_at")
VALUES ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000001', 'デフォルトプロジェクト', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "spaces" ("id", "kind", "project_id", "name", "sort_order", "created_at", "updated_at")
VALUES ('00000000-0000-4000-b000-000000000003', 'CHANNEL', '00000000-0000-4000-b000-000000000002', '全体共通', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 既存チャット明細／タスク明細を default channel へ収容（space_id NULL の既存行のみ）。
UPDATE "chat_themes" SET "space_id" = '00000000-0000-4000-b000-000000000003' WHERE "space_id" IS NULL;
UPDATE "tasks"       SET "space_id" = '00000000-0000-4000-b000-000000000003' WHERE "space_id" IS NULL;

-- 全 Account に default 組織/プロジェクトの membership を付与（Account.role を各スコープ role へ写像）。
-- 可視範囲＝メンバーシップ1階層のため、全既存ユーザーが default channel を見るには PROJECT membership が要る。
-- ON CONFLICT で冪等。uuid は gen_random_uuid()（PostgreSQL 13+ コア関数）。
INSERT INTO "memberships" ("id", "account_id", "scope_type", "scope_id", "role", "created_at", "updated_at")
SELECT gen_random_uuid(), a."id", 'ORGANIZATION', '00000000-0000-4000-b000-000000000001', a."role", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "accounts" a
ON CONFLICT ("account_id", "scope_type", "scope_id") DO NOTHING;

INSERT INTO "memberships" ("id", "account_id", "scope_type", "scope_id", "role", "created_at", "updated_at")
SELECT gen_random_uuid(), a."id", 'PROJECT', '00000000-0000-4000-b000-000000000002', a."role", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "accounts" a
ON CONFLICT ("account_id", "scope_type", "scope_id") DO NOTHING;
