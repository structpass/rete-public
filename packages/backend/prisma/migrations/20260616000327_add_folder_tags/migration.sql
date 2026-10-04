-- CreateTable
CREATE TABLE "folder_tags" (
    "folder_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_tags_pkey" PRIMARY KEY ("folder_id","tag_id")
);

-- CreateIndex
CREATE INDEX "folder_tags_tag_id_idx" ON "folder_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "folder_tags" ADD CONSTRAINT "folder_tags_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_tags" ADD CONSTRAINT "folder_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
