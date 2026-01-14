-- CreateTable
CREATE TABLE "FileRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "maxFileSize" BIGINT,
    "allowedTypes" TEXT,
    "uploadCount" INTEGER NOT NULL DEFAULT 0,
    "lastUploadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileRequestUpload" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "uploaderName" TEXT,
    "uploaderEmail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileRequestUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileRequest_token_key" ON "FileRequest"("token");

-- CreateIndex
CREATE INDEX "FileRequest_userId_idx" ON "FileRequest"("userId");

-- CreateIndex
CREATE INDEX "FileRequest_token_idx" ON "FileRequest"("token");

-- CreateIndex
CREATE INDEX "FileRequest_folderId_idx" ON "FileRequest"("folderId");

-- CreateIndex
CREATE INDEX "FileRequestUpload_requestId_idx" ON "FileRequestUpload"("requestId");

-- CreateIndex
CREATE INDEX "FileRequestUpload_fileId_idx" ON "FileRequestUpload"("fileId");

-- CreateIndex
CREATE INDEX "FileRequestUpload_uploaderEmail_idx" ON "FileRequestUpload"("uploaderEmail");

-- AddForeignKey
ALTER TABLE "FileRequest" ADD CONSTRAINT "FileRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRequest" ADD CONSTRAINT "FileRequest_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRequestUpload" ADD CONSTRAINT "FileRequestUpload_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FileRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
