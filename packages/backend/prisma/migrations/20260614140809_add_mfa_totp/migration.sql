-- AlterTable
ALTER TABLE "password_policies" ADD COLUMN     "mfa_enforced" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "mfa_settings" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "totp_secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mfa_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_backup_codes" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_settings_account_id_key" ON "mfa_settings"("account_id");

-- CreateIndex
CREATE INDEX "mfa_backup_codes_account_id_idx" ON "mfa_backup_codes"("account_id");

-- AddForeignKey
ALTER TABLE "mfa_settings" ADD CONSTRAINT "mfa_settings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
