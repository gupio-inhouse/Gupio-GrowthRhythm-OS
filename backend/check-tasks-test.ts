import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Searching for tasks with test or check in the title...');
  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { title: { contains: 'test', mode: 'insensitive' } },
        { title: { contains: 'check', mode: 'insensitive' } },
      ],
    },
    include: {
      assignee: { select: { name: true, email: true } },
      assignedBy: { select: { name: true, email: true } },
    },
  });

  console.log(`Found ${tasks.length} tasks:`);
  for (const t of tasks) {
    console.log(`- ID: ${t.id}`);
    console.log(`  Title: "${t.title}"`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Assignee: ${t.assignee?.name} (${t.assignee?.email})`);
    console.log(`  Assigned By: ${t.assignedBy?.name} (${t.assignedBy?.email})`);
    console.log(`  Created At: ${t.createdAt.toISOString()}`);
    console.log(`  Due Date: ${t.dueDate ? t.dueDate.toISOString() : 'None'}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
