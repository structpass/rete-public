-- CreateTable
CREATE TABLE "announcement_read_states" (
    "account_id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_read_states_pkey" PRIMARY KEY ("account_id","announcement_id")
);

-- CreateIndex
CREATE INDEX "announcement_read_states_announcement_id_idx" ON "announcement_read_states"("announcement_id");

-- AddForeignKey
ALTER TABLE "announcement_read_states" ADD CONSTRAINT "announcement_read_states_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_read_states" ADD CONSTRAINT "announcement_read_states_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
