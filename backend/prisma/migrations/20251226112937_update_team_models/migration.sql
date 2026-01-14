-- AlterEnum
ALTER TYPE "InviteStatus" ADD VALUE 'DECLINED';

-- AlterEnum
ALTER TYPE "TeamRole" ADD VALUE 'EDITOR';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "TeamInvite" ADD COLUMN     "invitedBy" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
