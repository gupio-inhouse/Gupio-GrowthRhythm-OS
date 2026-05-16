import fs from 'node:fs/promises';

import prismaModule from '../../../backend/dist/lib/prisma';
import { E2E_STATE_PATH, type E2EState } from './state';

const prisma = (prismaModule as typeof prismaModule & { default?: typeof prismaModule }).default ?? prismaModule;

async function cleanupOrg(orgId: string) {
  const orgUsers = await prisma.user.findMany({
    where: { orgId },
    select: { id: true },
  });
  const userIds = orgUsers.map((user) => user.id);

  await prisma.interviewScorecard.deleteMany({
    where: {
      OR: [
        { interviewerId: { in: userIds } },
        { candidate: { orgId } },
      ],
    },
  });
  await prisma.taskComment.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { task: { orgId } },
      ],
    },
  });
  await prisma.taskAttachment.deleteMany({
    where: { task: { orgId } },
  });
  await prisma.standupCard.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { standup: { orgId } },
      ],
    },
  });
  await prisma.learningAssignment.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { learningItem: { learningPath: { orgId } } },
      ],
    },
  });
  await prisma.magicLink.deleteMany({ where: { orgId } });
  await prisma.notification.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.onboardingChecklist.deleteMany({ where: { orgId } });
  await prisma.standup.deleteMany({ where: { orgId } });
  await prisma.task.deleteMany({ where: { orgId } });
  await prisma.candidate.deleteMany({ where: { orgId } });
  await prisma.jobDescription.deleteMany({ where: { orgId } });
  await prisma.review.deleteMany({ where: { orgId } });
  await prisma.learningItem.deleteMany({ where: { learningPath: { orgId } } });
  await prisma.learningPath.deleteMany({ where: { orgId } });
  await prisma.kRA.deleteMany({ where: { orgId } });
  await prisma.goal.deleteMany({ where: { orgId } });
  await prisma.department.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

export default async function globalTeardown() {
  try {
    const raw = await fs.readFile(E2E_STATE_PATH, 'utf8');
    const state = JSON.parse(raw) as E2EState;
    await cleanupOrg(state.orgId);
    await fs.rm(E2E_STATE_PATH, { force: true });
  } catch {
    // Cleanup is best effort.
  } finally {
    await prisma.$disconnect();
  }
}
