-- CreateTable
CREATE TABLE "role_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "role_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_key" TEXT NOT NULL,
    "can_read" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_update" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_definitions_name_key" ON "role_definitions"("name");

-- CreateIndex
-- 単独 role_id index は持たない（複合 unique の最左列で WHERE role_id=? を賄えるため・全置換の二重書込み回避）。
CREATE UNIQUE INDEX "role_permissions_role_id_resource_type_resource_key_key" ON "role_permissions"("role_id", "resource_type", "resource_key");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
-- resource_type は app 層 @IsIn(RESOURCE_TYPES) で強制するが、seed / 直叩きの typo 混入を DB でも backstop
-- する（Prisma schema では表現不可のため reaction_target_xor 等と同じ手書きマイグレーション運用）。
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_resource_type_valid" CHECK ("resource_type" IN ('system', 'rete_feature'));
