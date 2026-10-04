-- CreateTable
CREATE TABLE "announcement_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "announcement_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_tag_assignments" (
    "announcement_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_tag_assignments_pkey" PRIMARY KEY ("announcement_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "announcement_tags_name_key" ON "announcement_tags"("name");

-- CreateIndex
CREATE INDEX "announcement_tag_assignments_tag_id_idx" ON "announcement_tag_assignments"("tag_id");

-- AddForeignKey
ALTER TABLE "announcement_tag_assignments" ADD CONSTRAINT "announcement_tag_assignments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_tag_assignments" ADD CONSTRAINT "announcement_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "announcement_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
