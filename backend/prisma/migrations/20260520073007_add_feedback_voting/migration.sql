-- AlterTable
ALTER TABLE "app_feedback" ADD COLUMN     "upvotes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "app_feedback_votes" (
    "id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_feedback_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_feedback_votes_feedback_id_user_id_key" ON "app_feedback_votes"("feedback_id", "user_id");

-- AddForeignKey
ALTER TABLE "app_feedback_votes" ADD CONSTRAINT "app_feedback_votes_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "app_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
