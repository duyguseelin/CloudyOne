/*
  Warnings:

  - You are about to drop the column `cipherIv` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `contentSha256` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `cryptoVersion` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `edek` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `edekIv` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `encMeta` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `encryptionState` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `isEncrypted` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `legacyStorageKey` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `metaNameEnc` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `metaNameIv` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `migratedAt` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `migrationError` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `mimeEnc` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `originalName` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `cryptoVersion` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `kdfParams` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `kdfSalt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `recoveryEnabled` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `recoveryKeyEnc` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `recoveryKeySalt` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "File_storageKey_idx";

-- DropIndex
DROP INDEX "File_storageKey_key";

-- DropIndex
DROP INDEX "File_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "File" DROP COLUMN "cipherIv",
DROP COLUMN "contentSha256",
DROP COLUMN "cryptoVersion",
DROP COLUMN "edek",
DROP COLUMN "edekIv",
DROP COLUMN "encMeta",
DROP COLUMN "encryptionState",
DROP COLUMN "isEncrypted",
DROP COLUMN "legacyStorageKey",
DROP COLUMN "metaNameEnc",
DROP COLUMN "metaNameIv",
DROP COLUMN "migratedAt",
DROP COLUMN "migrationError",
DROP COLUMN "mimeEnc",
DROP COLUMN "originalName",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "cryptoVersion",
DROP COLUMN "kdfParams",
DROP COLUMN "kdfSalt",
DROP COLUMN "recoveryEnabled",
DROP COLUMN "recoveryKeyEnc",
DROP COLUMN "recoveryKeySalt";

-- DropEnum
DROP TYPE "EncryptionState";

-- DropEnum
DROP TYPE "FileStatus";
