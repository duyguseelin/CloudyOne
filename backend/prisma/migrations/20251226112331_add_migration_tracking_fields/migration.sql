-- AlterTable
ALTER TABLE "File" ADD COLUMN     "contentSha256" TEXT,
ADD COLUMN     "migratedAt" TIMESTAMP(3),
ADD COLUMN     "migrationError" TEXT;
