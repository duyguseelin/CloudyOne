-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recoveryKeyEnc" TEXT,
ADD COLUMN     "recoveryKeySalt" TEXT;
