-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('DOWNLOAD', 'VIEW');

-- AlterTable
ALTER TABLE "File"
    ADD COLUMN IF NOT EXISTS    "deletedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS    "extension" TEXT,
    ADD COLUMN IF NOT EXISTS    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS    "publicUrl" TEXT,
    ADD COLUMN IF NOT EXISTS    "shareLastOpenedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS    "shareOpenCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS    "sharePermission" "SharePermission",
    ADD COLUMN IF NOT EXISTS    "storageKey" TEXT,
    ADD COLUMN IF NOT EXISTS    "storageProvider" TEXT;

-- Safely alter types if columns exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='File' AND column_name='sizeBytes') THEN
        EXECUTE 'ALTER TABLE "File" ALTER COLUMN "sizeBytes" SET DATA TYPE BIGINT';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='File' AND column_name='shareToken') THEN
        EXECUTE 'ALTER TABLE "File" ALTER COLUMN "shareToken" SET DATA TYPE TEXT';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='File' AND column_name='shareExpiresAt') THEN
        EXECUTE 'ALTER TABLE "File" ALTER COLUMN "shareExpiresAt" SET DATA TYPE TIMESTAMP(3)';
    END IF;
END
$$;

-- AlterTable
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS    "plan" TEXT NOT NULL DEFAULT 'FREE',
    ADD COLUMN IF NOT EXISTS    "trashLimitBytes" BIGINT NOT NULL DEFAULT 1073741824,
    ADD COLUMN IF NOT EXISTS    "trashStorageBytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS    "usedStorageBytes" BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='storageLimitBytes') THEN
        EXECUTE 'ALTER TABLE "User" ALTER COLUMN "storageLimitBytes" SET DATA TYPE BIGINT';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='usedBytes') THEN
        EXECUTE 'ALTER TABLE "User" ALTER COLUMN "usedBytes" SET DATA TYPE BIGINT';
    END IF;
END
$$;

-- CreateTable
CREATE TABLE "FileVersion" (
    "id" SERIAL NOT NULL,
    "fileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "storageKey" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileTag" (
    "fileId" TEXT NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "FileTag_pkey" PRIMARY KEY ("fileId","tagId")
);

-- CreateTable
CREATE TABLE "FileShareLog" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "FileShareLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileVersion_fileId_idx" ON "FileVersion"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_fileId_version_key" ON "FileVersion"("fileId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileTag" ADD CONSTRAINT "FileTag_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileTag" ADD CONSTRAINT "FileTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileShareLog" ADD CONSTRAINT "FileShareLog_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
