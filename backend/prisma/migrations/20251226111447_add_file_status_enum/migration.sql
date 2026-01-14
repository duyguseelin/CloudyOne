-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'ACTIVE', 'DELETED');

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE';
