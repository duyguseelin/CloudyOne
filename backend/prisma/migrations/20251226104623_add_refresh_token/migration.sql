/*
  Warnings:

  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SecurityEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "RefreshToken_expiresAt_idx";

-- DropIndex
DROP INDEX "RefreshToken_userId_expiresAt_idx";

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "SecurityEvent";

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
