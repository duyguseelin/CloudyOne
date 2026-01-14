-- CreateTable
CREATE TABLE "QuickTransfer" (
    "id" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT,
    "storageKey" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER NOT NULL DEFAULT 10,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "QuickTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickTransfer_shareToken_key" ON "QuickTransfer"("shareToken");

-- CreateIndex
CREATE INDEX "QuickTransfer_shareToken_idx" ON "QuickTransfer"("shareToken");

-- CreateIndex
CREATE INDEX "QuickTransfer_createdBy_idx" ON "QuickTransfer"("createdBy");

-- CreateIndex
CREATE INDEX "QuickTransfer_expiresAt_idx" ON "QuickTransfer"("expiresAt");
