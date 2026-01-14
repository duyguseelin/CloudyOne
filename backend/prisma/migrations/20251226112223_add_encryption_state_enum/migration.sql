-- CreateEnum
CREATE TYPE "EncryptionState" AS ENUM ('PLAINTEXT', 'ENCRYPTED', 'MIGRATING', 'MIGRATION_FAILED');

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "encryptionState" "EncryptionState" NOT NULL DEFAULT 'PLAINTEXT',
ADD COLUMN     "legacyStorageKey" TEXT;
