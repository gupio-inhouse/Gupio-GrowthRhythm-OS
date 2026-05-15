-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "quiet_hours_end" INTEGER DEFAULT 7,
ADD COLUMN     "quiet_hours_start" INTEGER DEFAULT 22;
