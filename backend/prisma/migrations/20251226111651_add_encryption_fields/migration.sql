-- AlterTable
ALTER TABLE "File" ADD COLUMN     "cipherIv" TEXT,
ADD COLUMN     "cryptoVersion" TEXT,
ADD COLUMN     "edek" TEXT,
ADD COLUMN     "edekIv" TEXT,
ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metaNameEnc" TEXT,
ADD COLUMN     "metaNameIv" TEXT;
