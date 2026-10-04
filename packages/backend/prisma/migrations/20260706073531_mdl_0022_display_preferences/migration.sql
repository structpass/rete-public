-- CreateTable
CREATE TABLE "display_preferences" (
    "account_id" TEXT NOT NULL,
    "stripe_enabled" BOOLEAN NOT NULL DEFAULT true,
    "stripe_color" VARCHAR(7) NOT NULL DEFAULT '#FAFCFF',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "display_preferences_pkey" PRIMARY KEY ("account_id")
);

-- AddForeignKey
ALTER TABLE "display_preferences" ADD CONSTRAINT "display_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
