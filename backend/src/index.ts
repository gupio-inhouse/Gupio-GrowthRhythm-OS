import { createApp } from './app';
import prisma from './lib/prisma';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST;
const app = createApp();

async function backfillTaskDepartments() {
  try {
    // Fix all assigned tasks where departmentId is null OR doesn't match the assignee's dept.
    // Tasks must always live in the assignee's department to be correctly scoped.
    const assignedTasks = await prisma.task.findMany({
      where: { assigneeUserId: { not: null } },
      select: { id: true, assigneeUserId: true, departmentId: true },
    });
    let fixed = 0;
    for (const task of assignedTasks) {
      if (!task.assigneeUserId) continue;
      const assignee = await prisma.user.findUnique({
        where: { id: task.assigneeUserId },
        select: { departmentId: true },
      });
      if (!assignee?.departmentId) continue;
      if (task.departmentId === assignee.departmentId) continue; // already correct
      await prisma.task.update({ where: { id: task.id }, data: { departmentId: assignee.departmentId } });
      fixed++;
    }
    if (fixed > 0) console.log(`✅ Re-scoped ${fixed} tasks to their assignee's department`);
  } catch (e) {
    console.error('Task dept backfill error:', e);
  }
}

const onListen = () => {
  console.log(`🚀 GrowthRhythm API running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'test') {
    backfillTaskDepartments();
    import('./services/worker').catch(console.error);
    import('./services/queues')
      .then(({ scheduleRecurringJobs }) => scheduleRecurringJobs())
      .catch(console.error);
  }
};

const server = HOST ? app.listen(PORT, HOST, onListen) : app.listen(PORT, onListen);

process.on('SIGTERM', () => server.close());

export default app;
