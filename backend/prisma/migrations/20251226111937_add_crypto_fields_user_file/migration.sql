-- AlterTable
ALTER TABLE "File" ADD COLUMN     "encMeta" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cryptoVersion" INTEGER,
ADD COLUMN     "kdfParams" TEXT,
ADD COLUMN     "kdfSalt" TEXT;
