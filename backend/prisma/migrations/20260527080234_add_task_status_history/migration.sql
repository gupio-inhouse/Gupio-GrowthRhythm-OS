-- CreateTable
CREATE TABLE "task_status_histories" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "from_status" "TaskStatus",
    "to_status" "TaskStatus" NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" TEXT NOT NULL,
    "blocker_type" "BlockerType",
    "blocker_expected_resolution" TIMESTAMP(3),
    "suggestions" JSONB,

    CONSTRAINT "task_status_histories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "task_status_histories" ADD CONSTRAINT "task_status_histories_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_histories" ADD CONSTRAINT "task_status_histories_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
