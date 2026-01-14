-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'FILE_REQUEST_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'FILE_REQUEST_EXPIRED';
ALTER TYPE "ActivityType" ADD VALUE 'FILE_REQUEST_UPLOAD';
ALTER TYPE "ActivityType" ADD VALUE 'TEAM_FILE_UPLOAD';
ALTER TYPE "ActivityType" ADD VALUE 'TEAM_FILE_DELETE';
ALTER TYPE "ActivityType" ADD VALUE 'TEAM_FOLDER_CREATE';
ALTER TYPE "ActivityType" ADD VALUE 'TEAM_FOLDER_DELETE';
ALTER TYPE "ActivityType" ADD VALUE 'TEAM_FILE_COMMENT';
ALTER TYPE "ActivityType" ADD VALUE 'TEAM_FILE_DOWNLOAD';

-- AlterEnum
ALTER TYPE "SharePermission" ADD VALUE 'EDIT';

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedFromEmail" TEXT,
ADD COLUMN     "receivedFromName" TEXT,
ADD COLUMN     "teamDek" TEXT,
ADD COLUMN     "teamDekIv" TEXT,
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "FileRequestUpload" ADD COLUMN     "extension" TEXT,
ADD COLUMN     "filename" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "savedAt" TIMESTAMP(3),
ADD COLUMN     "savedToFiles" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sizeBytes" BIGINT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "storageProvider" TEXT;

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "QuickTransfer" ADD COLUMN     "cipherIv" TEXT,
ADD COLUMN     "dekSalt" TEXT,
ADD COLUMN     "encryptedDek" TEXT,
ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationToken" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN DEFAULT false,
ADD COLUMN     "trackShareLinks" BOOLEAN DEFAULT true,
ADD COLUMN     "warnLargeFiles" BOOLEAN DEFAULT true;

-- CreateTable
CREATE TABLE "FileComment" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileComment_fileId_idx" ON "FileComment"("fileId");

-- CreateIndex
CREATE INDEX "FileComment_userId_idx" ON "FileComment"("userId");

-- CreateIndex
CREATE INDEX "File_teamId_idx" ON "File"("teamId");

-- CreateIndex
CREATE INDEX "Folder_teamId_idx" ON "Folder"("teamId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileComment" ADD CONSTRAINT "FileComment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileComment" ADD CONSTRAINT "FileComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
