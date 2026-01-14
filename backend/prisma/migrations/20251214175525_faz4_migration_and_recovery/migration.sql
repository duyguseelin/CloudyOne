-- CreateEnum
CREATE TYPE "EncryptionState" AS ENUM ('PLAINTEXT', 'ENCRYPTED', 'MIGRATING', 'MIGRATION_FAILED');

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "contentSha256" TEXT,
ADD COLUMN     "encryptionState" "EncryptionState" NOT NULL DEFAULT 'PLAINTEXT',
ADD COLUMN     "legacyStorageKey" TEXT,
ADD COLUMN     "migratedAt" TIMESTAMP(3),
ADD COLUMN     "migrationError" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recoveryKeyEnc" TEXT,
ADD COLUMN     "recoveryKeySalt" TEXT;
