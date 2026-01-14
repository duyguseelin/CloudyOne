-- CreateTable: Add Zero-Knowledge Encryption Fields

-- AlterTable User: Add KDF and crypto version fields
ALTER TABLE "User"
  ADD COLUMN "kdfSalt" TEXT,
  ADD COLUMN "kdfParams" JSONB,
  ADD COLUMN "cryptoVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable File: Add encryption artifact fields
ALTER TABLE "File"
  ADD COLUMN "cryptoVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cipherIv" TEXT,
  ADD COLUMN "edek" TEXT,
  ADD COLUMN "edekIv" TEXT,
  ADD COLUMN "metaNameEnc" TEXT,
  ADD COLUMN "metaNameIv" TEXT,
  ADD COLUMN "isEncrypted" BOOLEAN NOT NULL DEFAULT false;

-- Comment on deprecated field
COMMENT ON COLUMN "File"."originalName" IS 'DEPRECATED: Use metaNameEnc for v3 encrypted files';
