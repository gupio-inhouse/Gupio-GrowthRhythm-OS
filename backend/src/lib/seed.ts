import bcrypt from 'bcryptjs';
import prisma from './prisma';

async function seed() {
  console.log('🌱 Seeding database...');

  // Organization (no slug field in schema, find by name or create)
  let org = await prisma.organization.findFirst({ where: { name: 'Demo Tech Solutions' } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Demo Tech Solutions',
        industry: 'IT Services',
        employeeCount: 45,
        plan: 'GROWTH',
      },
    });
  }
  console.log(`✅ Organization: ${org.name}`);

  // Owner
  const hash = await bcrypt.hash('Password@123', 12);

  const owner = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'owner@demo.com' } },
    update: {},
    create: {
      name: 'Rahul Mehta', email: 'owner@demo.com',
      passwordHash: hash, role: 'OWNER',
      orgId: org.id, status: 'ACTIVE',
    },
  });
  console.log(`✅ Owner: ${owner.name}`);

  // Departments (no emoji field — just name/slug)
  const eng = await prisma.department.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'engineering' } },
    update: {},
    create: { name: 'Engineering', slug: 'engineering', orgId: org.id },
  });
  const sales = await prisma.department.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'sales' } },
    update: {},
    create: { name: 'Sales', slug: 'sales', orgId: org.id },
  });
  const mkt = await prisma.department.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'marketing' } },
    update: {},
    create: { name: 'Marketing', slug: 'marketing', orgId: org.id },
  });
  await prisma.department.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'operations' } },
    update: {},
    create: { name: 'Operations', slug: 'operations', orgId: org.id },
  });
  console.log(`✅ 4 departments created`);

  // Users — unique key is orgId + email
  const engHead = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'priya@demo.com' } },
    update: {},
    create: {
      name: 'Priya Sharma', email: 'priya@demo.com',
      passwordHash: hash, role: 'DEPARTMENT_HEAD',
      orgId: org.id, departmentId: eng.id, status: 'ACTIVE',
    },
  });
  const salesHead = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'arjun@demo.com' } },
    update: {},
    create: {
      name: 'Arjun Kapoor', email: 'arjun@demo.com',
      passwordHash: hash, role: 'DEPARTMENT_HEAD',
      orgId: org.id, departmentId: sales.id, status: 'ACTIVE',
    },
  });
  const dev1 = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'dev1@demo.com' } },
    update: {},
    create: {
      name: 'Amit Patel', email: 'dev1@demo.com',
      passwordHash: hash, role: 'TEAM_MEMBER',
      orgId: org.id, departmentId: eng.id, managerId: engHead.id, status: 'ACTIVE',
    },
  });
  const dev2 = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'dev2@demo.com' } },
    update: {},
    create: {
      name: 'Sneha Joshi', email: 'dev2@demo.com',
      passwordHash: hash, role: 'TEAM_MEMBER',
      orgId: org.id, departmentId: eng.id, managerId: engHead.id, status: 'ACTIVE',
    },
  });
  const sales1 = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: 'sales1@demo.com' } },
    update: {},
    create: {
      name: 'Kavya Reddy', email: 'sales1@demo.com',
      passwordHash: hash, role: 'TEAM_MEMBER',
      orgId: org.id, departmentId: sales.id, managerId: salesHead.id, status: 'ACTIVE',
    },
  });

  // Set department heads (headUserId field)
  await prisma.department.update({ where: { id: eng.id }, data: { head: { connect: { id: engHead.id } } } });
  await prisma.department.update({ where: { id: sales.id }, data: { head: { connect: { id: salesHead.id } } } });
  console.log(`✅ 6 users created`);

  // Tasks — assigneeUserId (not assigneeId), no createdById in schema
  const taskData = [
    {
      id: 'seed-task-1', title: 'Design new API authentication flow',
      status: 'IN_PROGRESS' as const, priority: 'HIGH' as const,
      orgId: org.id, departmentId: eng.id,
      assignedByUserId: engHead.id,
      assigneeUserId: dev1.id,
      dueDate: new Date(Date.now() + 3 * 86400000),
    },
    {
      id: 'seed-task-2', title: 'Fix rate limiting bug on /api/v1/data endpoint',
      status: 'BLOCKED' as const, priority: 'CRITICAL' as const,
      orgId: org.id, departmentId: eng.id,
      assignedByUserId: engHead.id,
      assigneeUserId: dev2.id,
      dueDate: new Date(Date.now() + 86400000),
      blockerType: 'DEPENDENCY' as const,
    },
    {
      id: 'seed-task-3', title: 'Write API documentation for v2 endpoints',
      status: 'TODO' as const, priority: 'MEDIUM' as const,
      orgId: org.id, departmentId: eng.id,
      assignedByUserId: engHead.id,
      assigneeUserId: dev1.id,
      dueDate: new Date(Date.now() + 7 * 86400000),
    },
    {
      id: 'seed-task-4', title: 'Follow up with TechCorp deal — send proposal',
      status: 'TODO' as const, priority: 'HIGH' as const,
      orgId: org.id, departmentId: sales.id,
      assignedByUserId: salesHead.id,
      assigneeUserId: sales1.id,
      dueDate: new Date(Date.now() + 2 * 86400000),
    },
    {
      id: 'seed-task-5', title: 'Conduct product demo for 5 leads this week',
      status: 'IN_PROGRESS' as const, priority: 'HIGH' as const,
      orgId: org.id, departmentId: sales.id,
      assignedByUserId: salesHead.id,
      assigneeUserId: salesHead.id,
      dueDate: new Date(Date.now() + 5 * 86400000),
    },
    {
      id: 'seed-task-6', title: 'Set up CI/CD pipeline for v2 services',
      status: 'DONE' as const, priority: 'HIGH' as const,
      orgId: org.id, departmentId: eng.id,
      assignedByUserId: engHead.id,
      assigneeUserId: dev2.id,
      dueDate: new Date(Date.now() - 3 * 86400000),
      completedAt: new Date(Date.now() - 86400000),
    },
  ];

  for (const t of taskData) {
    await prisma.task.upsert({ where: { id: t.id }, update: {}, create: t });
  }
  console.log(`✅ ${taskData.length} tasks`);

  // Standup — no facilitatorId field in schema
  const today = new Date();
  today.setHours(9, 0, 0, 0);

  let standup = await prisma.standup.findFirst({
    where: { orgId: org.id, departmentId: eng.id, scheduledAt: today },
  });
  if (!standup) {
    standup = await prisma.standup.create({
      data: {
        orgId: org.id,
        departmentId: eng.id,
        scheduledAt: today,
        status: 'SCHEDULED',
      },
    });
  }

  for (const member of [engHead, dev1, dev2]) {
    await prisma.standupCard.upsert({
      where: { standupId_userId: { standupId: standup.id, userId: member.id } },
      update: {},
      create: {
        standupId: standup.id,
        userId: member.id,
        yesterdaySummary: 'Completed code review and fixed 2 minor bugs',
        todayCommitments: 'Continuing API authentication flow',
        blockers: member.id === dev2.id ? 'Blocked on Redis cluster upgrade' : null,
      },
    });
  }
  console.log(`✅ Standup seeded`);

  console.log('\n🎉 Done!\n');
  console.log('Credentials (all: Password@123)');
  console.log('  owner@demo.com  — Owner');
  console.log('  priya@demo.com  — Engineering Head');
  console.log('  arjun@demo.com  — Sales Head');
  console.log('  dev1@demo.com   — Team Member');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
