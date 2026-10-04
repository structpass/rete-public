-- Migration: add_task_owner_and_rbac_enforcement (H4)
-- Adds Task.ownerId FK for owner-based authorization enforcement.
-- Existing rows get ownerId = NULL (no backfill required;
-- NULL owner is handled by assertOwnerOrAdmin: ADMIN can edit, MEMBER cannot).

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "owner_id" TEXT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tasks_owner_id_idx" ON "tasks"("owner_id");
