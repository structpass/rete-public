-- CreateTable
CREATE TABLE "desk_preferences" (
    "account_id" TEXT NOT NULL,
    "left_pane_ratio" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "desk_preferences_pkey" PRIMARY KEY ("account_id")
);

-- AddForeignKey
ALTER TABLE "desk_preferences" ADD CONSTRAINT "desk_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
