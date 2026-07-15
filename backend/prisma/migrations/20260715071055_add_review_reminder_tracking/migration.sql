-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "invitation_sent_at" TIMESTAMP(3),
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

