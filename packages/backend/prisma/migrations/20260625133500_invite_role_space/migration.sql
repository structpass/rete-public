-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "business_role_id" TEXT,
ADD COLUMN     "space_id" TEXT;

-- CreateIndex
CREATE INDEX "invites_business_role_id_idx" ON "invites"("business_role_id");

-- CreateIndex
CREATE INDEX "invites_space_id_idx" ON "invites"("space_id");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_business_role_id_fkey" FOREIGN KEY ("business_role_id") REFERENCES "role_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
