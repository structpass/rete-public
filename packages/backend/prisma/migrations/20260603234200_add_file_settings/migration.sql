-- CreateTable
CREATE TABLE "file_settings" (
    "id" TEXT NOT NULL,
    "max_size_bytes" BIGINT NOT NULL,
    "allowed_extensions" TEXT[],
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "file_settings_pkey" PRIMARY KEY ("id")
);
