-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('CLEAR', 'NEEDS_REVIEW', 'UNDER_REVIEW', 'RESOLVED');

-- AlterTable
ALTER TABLE "Fragment" ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'CLEAR';
