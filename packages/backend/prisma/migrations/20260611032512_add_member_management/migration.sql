-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "business_role_id" TEXT;

-- CreateTable
CREATE TABLE "user_system_access" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "can_access" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_system_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_system_access_account_id_system_id_key" ON "user_system_access"("account_id", "system_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_business_role_id_fkey" FOREIGN KEY ("business_role_id") REFERENCES "role_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_system_access" ADD CONSTRAINT "user_system_access_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_system_access" ADD CONSTRAINT "user_system_access_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "tenant_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
