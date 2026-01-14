-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'ACTIVE', 'DELETED');

-- AlterTable
ALTER TABLE "File" 
  ADD COLUMN "originalName" TEXT,
  ADD COLUMN "status" "FileStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex (storageKey unique)
CREATE UNIQUE INDEX "File_storageKey_key" ON "File"("storageKey");

-- CreateIndex (userId + createdAt for efficient user file queries)
CREATE INDEX "File_userId_createdAt_idx" ON "File"("userId", "createdAt" DESC);

-- CreateIndex (storageKey for R2 key lookups)
CREATE INDEX "File_storageKey_idx" ON "File"("storageKey");

-- Migrate existing files to ACTIVE status
UPDATE "File" SET "status" = 'ACTIVE' WHERE "isDeleted" = false;
UPDATE "File" SET "status" = 'DELETED' WHERE "isDeleted" = true;
