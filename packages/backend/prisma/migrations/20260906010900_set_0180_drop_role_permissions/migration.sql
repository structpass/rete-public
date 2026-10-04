-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_business_role_id_fkey";

-- DropForeignKey
ALTER TABLE "invites" DROP CONSTRAINT "invites_business_role_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "user_system_access" DROP CONSTRAINT "user_system_access_account_id_fkey";

-- DropForeignKey
ALTER TABLE "user_system_access" DROP CONSTRAINT "user_system_access_system_id_fkey";

-- DropIndex
DROP INDEX "accounts_business_role_id_idx";

-- DropIndex
DROP INDEX "invites_business_role_id_idx";

-- AlterTable
ALTER TABLE "accounts" DROP COLUMN "business_role_id";

-- AlterTable
ALTER TABLE "invites" DROP COLUMN "business_role_id";

-- DropTable
DROP TABLE "role_definitions";

-- DropTable
DROP TABLE "role_permissions";

-- DropTable
DROP TABLE "user_system_access";
