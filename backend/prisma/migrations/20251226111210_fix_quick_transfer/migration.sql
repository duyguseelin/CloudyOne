/*
  Warnings:

  - You are about to drop the column `createdBy` on the `QuickTransfer` table. All the data in the column will be lost.
  - You are about to drop the column `filename` on the `QuickTransfer` table. All the data in the column will be lost.
  - You are about to drop the column `maxDownloads` on the `QuickTransfer` table. All the data in the column will be lost.
  - Added the required column `fileName` to the `QuickTransfer` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "QuickTransfer_createdBy_idx";

-- AlterTable
ALTER TABLE "QuickTransfer" DROP COLUMN "createdBy",
DROP COLUMN "filename",
DROP COLUMN "maxDownloads",
ADD COLUMN     "downloadLimit" INTEGER,
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "sendMethod" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "QuickTransfer_userId_idx" ON "QuickTransfer"("userId");
