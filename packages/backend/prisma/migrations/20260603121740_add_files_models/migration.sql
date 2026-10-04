-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_folder_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_parent_folder_id_sort_order_idx" ON "folders"("parent_folder_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "folders_parent_folder_id_name_key" ON "folders"("parent_folder_id", "name");

-- CreateIndex
CREATE INDEX "files_folder_id_idx" ON "files"("folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_folder_id_name_key" ON "files"("folder_id", "name");

-- CreateIndex
CREATE INDEX "file_versions_file_id_version_no_idx" ON "file_versions"("file_id", "version_no");

-- CreateIndex
CREATE INDEX "file_versions_uploaded_by_id_idx" ON "file_versions"("uploaded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_file_id_version_no_key" ON "file_versions"("file_id", "version_no");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
