-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('FILE_UPLOAD', 'FILE_DOWNLOAD', 'FILE_DELETE', 'FILE_SHARE', 'FILE_SHARE_EXPIRED', 'FILE_RENAME', 'FILE_RESTORE', 'FILE_MOVE', 'FOLDER_CREATE', 'FOLDER_DELETE', 'TEAM_MEMBER_JOINED', 'TEAM_MEMBER_LEFT', 'TEAM_INVITE_SENT', 'STORAGE_WARNING', 'STORAGE_FULL');

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "fileId" TEXT,
    "fileName" TEXT,
    "folderId" TEXT,
    "folderName" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "metadata" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "Activity"("userId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_isRead_idx" ON "Activity"("isRead");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
