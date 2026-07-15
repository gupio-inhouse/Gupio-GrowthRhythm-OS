-- CreateTable
CREATE TABLE "goal_attachments" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "goal_attachments" ADD CONSTRAINT "goal_attachments_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

