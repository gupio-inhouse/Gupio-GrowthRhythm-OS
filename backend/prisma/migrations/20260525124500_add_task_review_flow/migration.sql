ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';

ALTER TABLE "tasks"
ADD COLUMN "assigned_by_user_id" TEXT,
ADD COLUMN "completion_submitted_at" TIMESTAMP(3),
ADD COLUMN "completion_reviewed_at" TIMESTAMP(3),
ADD COLUMN "completion_reviewed_by_user_id" TEXT;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_assigned_by_user_id_fkey"
FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_completion_reviewed_by_user_id_fkey"
FOREIGN KEY ("completion_reviewed_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
