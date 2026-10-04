-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oidc_payloads" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "grant_id" TEXT,
    "user_code" TEXT,
    "uid" TEXT,
    "expires_at" TIMESTAMPTZ,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE INDEX "oidc_payloads_grant_id_idx" ON "oidc_payloads"("grant_id");

-- CreateIndex
CREATE INDEX "oidc_payloads_user_code_idx" ON "oidc_payloads"("user_code");

-- CreateIndex
CREATE INDEX "oidc_payloads_type_uid_idx" ON "oidc_payloads"("type", "uid");

-- CreateIndex
CREATE UNIQUE INDEX "oidc_payloads_type_model_id_key" ON "oidc_payloads"("type", "model_id");
