-- CreateEnum
CREATE TYPE "BugType" AS ENUM ('BUG', 'ENHANCEMENT');

-- AlterTable
ALTER TABLE "bugs" ADD COLUMN     "type" "BugType" NOT NULL DEFAULT 'BUG';

