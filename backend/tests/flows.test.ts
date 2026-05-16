process.env.NODE_ENV = 'test';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';

import { createApp } from '../src/app';
import prisma from '../src/lib/prisma';
import redis from '../src/lib/redis';

const PASSWORD = 'Password@123';

type ApiResponse<T> = {
  status: number;
  body: T;
};

type AuthBundle = {
  token: string;
  user: { id: string; role: string; email: string; departmentId?: string | null; departmentSlug?: string | null };
  org: { id: string; name: string };
};

const state: {
  server?: Server;
  baseUrl?: string;
  runId: string;
  orgId?: string;
  owner?: AuthBundle;
  companyAdminId?: string;
  departmentId?: string;
  departmentSlug?: string;
  managerId?: string;
  managerInviteLink?: string;
  teamMemberId?: string;
  coachId?: string;
  departmentHeadId?: string;
  superAdminId?: string;
  goalId?: string;
  kraId?: string;
  taskId?: string;
  learningPathId?: string;
  learningItemId?: string;
  learningAssignmentId?: string;
  reviewId?: string;
  jobId?: string;
  candidateId?: string;
  standupId?: string;
  standupCardId?: string;
} = {
  runId: `flow-${Date.now()}`,
};

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');

  const res = await fetch(`${state.baseUrl}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) as T : null as T;
  return { status: res.status, body };
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function login(email: string) {
  const res = await jsonRequest<AuthBundle>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `expected login success for ${email}`);
  return res.body;
}

before(async () => {
  const app = createApp();
  state.server = createServer(app);
  await new Promise<void>((resolve) => state.server!.listen(0, resolve));
  const addr = state.server.address() as AddressInfo;
  state.baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (state.orgId) {
    const orgUsers = await prisma.user.findMany({
      where: { orgId: state.orgId },
      select: { id: true },
    });
    const userIds = orgUsers.map((user) => user.id);

    await prisma.interviewScorecard.deleteMany({
      where: {
        OR: [
          { interviewerId: { in: userIds } },
          { candidate: { orgId: state.orgId } },
        ],
      },
    });
    await prisma.taskComment.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { task: { orgId: state.orgId } },
        ],
      },
    });
    await prisma.taskAttachment.deleteMany({
      where: { task: { orgId: state.orgId } },
    });
    await prisma.standupCard.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { standup: { orgId: state.orgId } },
        ],
      },
    });
    await prisma.learningAssignment.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { learningItem: { learningPath: { orgId: state.orgId } } },
        ],
      },
    });
    await prisma.magicLink.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.notification.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.auditLog.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.onboardingChecklist.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.standup.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.task.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.candidate.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.jobDescription.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.review.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.learningItem.deleteMany({
      where: { learningPath: { orgId: state.orgId } },
    });
    await prisma.learningPath.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.kRA.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.goal.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.department.deleteMany({
      where: { orgId: state.orgId },
    });
    await prisma.user.deleteMany({
      where: { orgId: state.orgId },
    });

    await prisma.organization.deleteMany({
      where: { id: state.orgId },
    });
  }

  if (state.server) {
    await new Promise<void>((resolve, reject) => {
      state.server!.close((err) => err ? reject(err) : resolve());
    });
  }

  await prisma.$disconnect();
  await redis.quit();
});

test('registers a workspace and persists owner plus default departments', async () => {
  const email = `${state.runId}.owner@example.com`;
  const companyName = `Flow Org ${state.runId}`;

  const res = await jsonRequest<AuthBundle>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Flow Owner',
      email,
      password: PASSWORD,
      companyName,
      industry: 'IT Services',
      employeeCount: 25,
      fiscalYearStart: 4,
      preferredLanguage: 'en',
    }),
  });

  assert.equal(res.status, 201);
  state.owner = res.body;
  state.orgId = res.body.org.id;

  const org = await prisma.organization.findUnique({
    where: { id: state.orgId },
    include: { users: true, departments: true },
  });

  assert.ok(org);
  assert.equal(org.name, companyName);
  assert.equal(org.users.length, 1);
  assert.ok(org.departments.length >= 5);

  const primaryDept = org.departments[0];
  assert.ok(primaryDept);
  state.departmentId = primaryDept.id;
  state.departmentSlug = primaryDept.slug;
});

test('logs in owner and returns profile data', async () => {
  const owner = await login(state.owner!.user.email);
  const me = await jsonRequest<{ id: string; role: string; org: { id: string } }>('/api/auth/me', {
    headers: authHeaders(owner.token),
  });

  assert.equal(me.status, 200);
  assert.equal(me.body.id, owner.user.id);
  assert.equal(me.body.role, 'OWNER');
  assert.equal(me.body.org.id, state.orgId);
});

test('creates invited users, bulk-imported company admin, and a super admin', async () => {
  const ownerToken = state.owner!.token;
  const invites = [
    { name: 'Dept Head', email: `${state.runId}.head@example.com`, role: 'DEPARTMENT_HEAD' },
    { name: 'Manager User', email: `${state.runId}.manager@example.com`, role: 'MANAGER' },
    { name: 'Team Member', email: `${state.runId}.member@example.com`, role: 'TEAM_MEMBER' },
    { name: 'Coach User', email: `${state.runId}.coach@example.com`, role: 'COACH_ADVISOR' },
  ] as const;

  for (const invite of invites) {
    const body: Record<string, string> = {
      name: invite.name,
      email: invite.email,
      role: invite.role,
      departmentId: state.departmentId!,
      phone: '9999999999',
    };
    if (invite.role === 'TEAM_MEMBER') body.managerId = state.managerId!;

    const res = await jsonRequest<{ id: string; emailSent: boolean; inviteLink?: string | null }>('/api/users/invite', {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify(body),
    });

    assert.equal(res.status, 201, `invite failed for ${invite.role}`);

    if (invite.role === 'DEPARTMENT_HEAD') state.departmentHeadId = res.body.id;
    if (invite.role === 'MANAGER') {
      state.managerId = res.body.id;
      state.managerInviteLink = res.body.inviteLink ?? undefined;
    }
    if (invite.role === 'TEAM_MEMBER') state.teamMemberId = res.body.id;
    if (invite.role === 'COACH_ADVISOR') state.coachId = res.body.id;

    const persistedInvite = await prisma.user.findUnique({ where: { id: res.body.id } });
    assert.ok(persistedInvite);
    assert.equal(persistedInvite.status, 'INVITED');

    const magicLink = await prisma.magicLink.findFirst({
      where: { userId: res.body.id },
    });
    assert.ok(magicLink, `expected magic link row for ${invite.role}`);
  }

  const bulkRes = await jsonRequest<{ created: number; errors: string[] }>('/api/users/bulk-import', {
    method: 'POST',
    headers: authHeaders(ownerToken),
    body: JSON.stringify({
      rows: [
        {
          name: 'Company Admin',
          email: `${state.runId}.admin@example.com`,
          role: 'COMPANY_ADMIN',
          phone: '8888888888',
          departmentId: state.departmentId!,
        },
      ],
    }),
  });
  assert.equal(bulkRes.status, 200);
  assert.equal(bulkRes.body.created, 1);
  assert.equal(bulkRes.body.errors.length, 0);

  const companyAdmin = await prisma.user.findFirstOrThrow({
    where: { orgId: state.orgId, email: `${state.runId}.admin@example.com` },
  });
  state.companyAdminId = companyAdmin.id;
  assert.equal(companyAdmin.role, 'COMPANY_ADMIN');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.updateMany({
    where: { id: { in: [state.departmentHeadId!, state.teamMemberId!, state.coachId!, state.companyAdminId!] } },
    data: { status: 'ACTIVE', passwordHash },
  });

  await prisma.user.update({
    where: { id: state.teamMemberId! },
    data: { managerId: state.managerId! },
  });
  await prisma.department.update({
    where: { id: state.departmentId! },
    data: { headUserId: state.departmentHeadId! },
  });

  const superAdmin = await prisma.user.create({
    data: {
      orgId: state.orgId!,
      email: `${state.runId}.super@example.com`,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      passwordHash,
    },
  });
  state.superAdminId = superAdmin.id;
});

test('allows an invited manager to set a password through the invite link and log in later', async () => {
  assert.ok(state.managerInviteLink, 'expected manager invite link to be available');
  const inviteToken = new URL(state.managerInviteLink!).searchParams.get('token');
  assert.ok(inviteToken, 'expected invite token in manager invite link');

  const verifyRes = await jsonRequest<{
    setupRequired: boolean;
    user: { id: string; email: string; role: string };
  }>('/api/magic/verify', {
    method: 'POST',
    body: JSON.stringify({ token: inviteToken }),
  });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.setupRequired, true);
  assert.equal(verifyRes.body.user.id, state.managerId);

  const acceptRes = await jsonRequest<AuthBundle>('/api/magic/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token: inviteToken, password: PASSWORD }),
  });

  assert.equal(acceptRes.status, 200);
  assert.equal(acceptRes.body.user.id, state.managerId);
  assert.equal(acceptRes.body.user.role, 'MANAGER');

  const manager = await prisma.user.findUniqueOrThrow({ where: { id: state.managerId! } });
  assert.equal(manager.status, 'ACTIVE');
  assert.ok(manager.passwordHash);

  const loginRes = await jsonRequest<AuthBundle>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: `${state.runId}.manager@example.com`, password: PASSWORD }),
  });
  assert.equal(loginRes.status, 200);
});

test('allows each role to authenticate and access a representative flow', async () => {
  const owner = await login(state.owner!.user.email);
  const companyAdmin = await login(`${state.runId}.admin@example.com`);
  const departmentHead = await login(`${state.runId}.head@example.com`);
  const manager = await login(`${state.runId}.manager@example.com`);
  const teamMember = await login(`${state.runId}.member@example.com`);
  const coach = await login(`${state.runId}.coach@example.com`);
  const superAdmin = await login(`${state.runId}.super@example.com`);

  state.owner = owner;

  const ownerCockpit = await jsonRequest('/api/owner/cockpit', { headers: authHeaders(owner.token) });
  assert.equal(ownerCockpit.status, 200);

  const adminCockpit = await jsonRequest('/api/owner/cockpit', { headers: authHeaders(companyAdmin.token) });
  assert.equal(adminCockpit.status, 200);

  const deptList = await jsonRequest<Array<{ id: string }>>('/api/departments', { headers: authHeaders(departmentHead.token) });
  assert.equal(deptList.status, 200);
  assert.ok(deptList.body.length >= 1);

  const managerTasks = await jsonRequest('/api/tasks', { headers: authHeaders(manager.token) });
  assert.equal(managerTasks.status, 200);

  const teamTasks = await jsonRequest('/api/tasks', { headers: authHeaders(teamMember.token) });
  assert.equal(teamTasks.status, 200);

  const coachLearning = await jsonRequest('/api/learning/paths', { headers: authHeaders(coach.token) });
  assert.equal(coachLearning.status, 200);

  const superStats = await jsonRequest('/api/superadmin/stats', { headers: authHeaders(superAdmin.token) });
  assert.equal(superStats.status, 200);
});

test('persists goals, KRAs, tasks, notifications, and task progress', async () => {
  const ownerToken = state.owner!.token;

  const goalRes = await jsonRequest<{ id: string; title: string }>('/api/goals', {
    method: 'POST',
    headers: authHeaders(ownerToken),
    body: JSON.stringify({
      title: `Goal ${state.runId}`,
      description: 'Grow execution quality',
      type: 'DEPARTMENT',
      ownerUserId: state.owner!.user.id,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      period: 'Q2 FY2026',
    }),
  });
  assert.equal(goalRes.status, 201);
  state.goalId = goalRes.body.id;

  const goal = await prisma.goal.findUnique({ where: { id: state.goalId } });
  assert.ok(goal);
  assert.equal(goal.title, `Goal ${state.runId}`);

  const kraRes = await jsonRequest<{ id: string; name: string }>('/api/kras', {
    method: 'POST',
    headers: authHeaders(ownerToken),
    body: JSON.stringify({
      name: `KRA ${state.runId}`,
      description: 'Reduce lead time',
      departmentId: state.departmentId!,
      goalId: state.goalId,
      ownerUserId: state.departmentHeadId!,
      target: 3,
      unit: 'tasks',
      period: 'Q2 FY2026',
    }),
  });
  assert.equal(kraRes.status, 201);
  state.kraId = kraRes.body.id;

  const taskRes = await jsonRequest<{ id: string; assigneeUserId: string }>('/api/tasks', {
    method: 'POST',
    headers: authHeaders(ownerToken),
    body: JSON.stringify({
      title: `Task ${state.runId}`,
      description: 'Complete the smoke flow',
      expectedOutcome: 'Persisted in local db',
      kraId: state.kraId,
      departmentId: state.departmentId!,
      assigneeUserId: state.teamMemberId!,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assert.equal(taskRes.status, 201);
  state.taskId = taskRes.body.id;

  const task = await prisma.task.findUnique({ where: { id: state.taskId } });
  assert.ok(task);
  assert.equal(task.assigneeUserId, state.teamMemberId);

  const manager = await login(`${state.runId}.manager@example.com`);
  const managerTasks = await jsonRequest<Array<{ id: string }>>('/api/tasks', {
    headers: authHeaders(manager.token),
  });
  assert.equal(managerTasks.status, 200);
  assert.ok(managerTasks.body.some((item) => item.id === state.taskId));

  const taskAssignedNotif = await prisma.notification.findFirst({
    where: {
      orgId: state.orgId,
      userId: state.teamMemberId,
      type: 'TASK_ASSIGNED',
    },
  });
  assert.ok(taskAssignedNotif);

  const teamMember = await login(`${state.runId}.member@example.com`);
  const commentRes = await jsonRequest<{ id: string }>('/api/tasks/' + state.taskId + '/comments', {
    method: 'POST',
    headers: authHeaders(teamMember.token),
    body: JSON.stringify({ content: 'Started work' }),
  });
  assert.equal(commentRes.status, 201);

  const doneRes = await jsonRequest<{ id: string; status: string }>('/api/tasks/' + state.taskId, {
    method: 'PATCH',
    headers: authHeaders(teamMember.token),
    body: JSON.stringify({ status: 'DONE' }),
  });
  assert.equal(doneRes.status, 200);
  assert.equal(doneRes.body.status, 'DONE');

  const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: state.taskId } });
  assert.equal(updatedTask.status, 'DONE');
  assert.ok(updatedTask.completedAt);

  const updatedKra = await prisma.kRA.findUniqueOrThrow({ where: { id: state.kraId } });
  assert.equal(updatedKra.current, 1);
});

test('persists learning path, item, assignment, and completion', async () => {
  const ownerToken = state.owner!.token;

  const pathRes = await jsonRequest<{ id: string; title: string }>('/api/learning/paths', {
    method: 'POST',
    headers: authHeaders(ownerToken),
    body: JSON.stringify({
      title: `Learning Path ${state.runId}`,
      description: 'Skill uplift',
      departmentId: state.departmentId!,
    }),
  });
  assert.equal(pathRes.status, 201);
  state.learningPathId = pathRes.body.id;

  const itemRes = await jsonRequest<{ id: string; title: string }>('/api/learning/paths/' + state.learningPathId + '/items', {
    method: 'POST',
    headers: authHeaders(ownerToken),
    body: JSON.stringify({
      type: 'VIDEO',
      title: `Learning Item ${state.runId}`,
      description: 'Watch and learn',
      contentUrl: 'https://example.com/video',
      estimatedMinutes: 15,
    }),
  });
  assert.equal(itemRes.status, 201);
  state.learningItemId = itemRes.body.id;

  const assignRes = await jsonRequest<{ id: string; userId: string }>('/api/learning/assignments', {
    method: 'POST',
    headers: authHeaders(ownerToken),
    body: JSON.stringify({
      learningItemId: state.learningItemId,
      userId: state.teamMemberId,
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    }),
  });
  assert.equal(assignRes.status, 201);
  state.learningAssignmentId = assignRes.body.id;

  const assignment = await prisma.learningAssignment.findUniqueOrThrow({ where: { id: state.learningAssignmentId } });
  assert.equal(assignment.userId, state.teamMemberId);

  const teamMember = await login(`${state.runId}.member@example.com`);
  const completeRes = await jsonRequest<{ status: string }>('/api/learning/assignments/' + state.learningAssignmentId + '/complete', {
    method: 'PATCH',
    headers: authHeaders(teamMember.token),
    body: JSON.stringify({ score: 92 }),
  });
  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.status, 'COMPLETED');

  const completed = await prisma.learningAssignment.findUniqueOrThrow({ where: { id: state.learningAssignmentId } });
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.score, 92);
});

test('persists review lifecycle, hiring flow, and standup flow', async () => {
  const departmentHead = await login(`${state.runId}.head@example.com`);
  const companyAdmin = await login(`${state.runId}.admin@example.com`);
  const owner = state.owner!;
  const manager = await login(`${state.runId}.manager@example.com`);
  const teamMember = await login(`${state.runId}.member@example.com`);

  const reviewRes = await jsonRequest<{ id: string }>('/api/reviews', {
    method: 'POST',
    headers: authHeaders(departmentHead.token),
    body: JSON.stringify({
      type: 'DEPARTMENT',
      departmentId: state.departmentId!,
      scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      agenda: 'Weekly department review',
    }),
  });
  assert.equal(reviewRes.status, 201);
  state.reviewId = reviewRes.body.id;

  const reviewUpdate = await jsonRequest<{ decisions: string }>('/api/reviews/' + state.reviewId, {
    method: 'PATCH',
    headers: authHeaders(owner.token),
    body: JSON.stringify({
      decisions: 'Proceed with rollout',
      actionItems: [{ text: 'Ship smoke suite', owner: 'Manager User', dueDate: new Date().toISOString(), done: false }],
    }),
  });
  assert.equal(reviewUpdate.status, 200);

  const persistedReview = await prisma.review.findUniqueOrThrow({ where: { id: state.reviewId } });
  assert.equal(persistedReview.decisions, 'Proceed with rollout');

  const reviewDelete = await jsonRequest<{ success: boolean }>('/api/reviews/' + state.reviewId, {
    method: 'DELETE',
    headers: authHeaders(companyAdmin.token),
  });
  assert.equal(reviewDelete.status, 200);
  const deletedReview = await prisma.review.findUnique({ where: { id: state.reviewId } });
  assert.equal(deletedReview, null);

  const jobRes = await jsonRequest<{ id: string; title: string }>('/api/hiring/jobs', {
    method: 'POST',
    headers: authHeaders(departmentHead.token),
    body: JSON.stringify({
      title: `Engineer ${state.runId}`,
      description: 'Backend engineer role',
      requirements: 'TypeScript, Prisma',
      location: 'Remote',
      isRemote: true,
      departmentId: state.departmentId!,
    }),
  });
  assert.equal(jobRes.status, 201);
  state.jobId = jobRes.body.id;

  const candidateRes = await jsonRequest<{ id: string; jobId: string }>('/api/hiring/candidates', {
    method: 'POST',
    headers: authHeaders(owner.token),
    body: JSON.stringify({
      jobId: state.jobId,
      name: 'Candidate One',
      email: `${state.runId}.candidate@example.com`,
      phone: '7777777777',
      resumeUrl: 'https://example.com/resume.pdf',
      linkedinUrl: 'https://linkedin.com/in/candidate-one',
      consentGiven: true,
    }),
  });
  assert.equal(candidateRes.status, 201);
  state.candidateId = candidateRes.body.id;

  const scorecardRes = await jsonRequest<{ id: string; round: string }>('/api/hiring/candidates/' + state.candidateId + '/scorecards', {
    method: 'POST',
    headers: authHeaders(manager.token),
    body: JSON.stringify({
      round: 'Technical',
      scores: { systemDesign: 8, coding: 9 },
      overallRating: 9,
      recommendation: 'Strong hire',
      notes: 'Great performance',
    }),
  });
  assert.equal(scorecardRes.status, 201);

  const persistedCandidate = await prisma.candidate.findUniqueOrThrow({
    where: { id: state.candidateId },
    include: { scorecards: true },
  });
  assert.equal(persistedCandidate.scorecards.length, 1);

  const standupRes = await jsonRequest<{ id: string; status: string }>('/api/standups', {
    method: 'POST',
    headers: authHeaders(manager.token),
    body: JSON.stringify({
      departmentId: state.departmentId!,
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  });
  assert.equal(standupRes.status, 201);
  state.standupId = standupRes.body.id;

  const startRes = await jsonRequest<{ status: string }>('/api/standups/' + state.standupId + '/start', {
    method: 'POST',
    headers: authHeaders(manager.token),
  });
  assert.equal(startRes.status, 200);
  assert.equal(startRes.body.status, 'IN_PROGRESS');

  const cardCreate = await jsonRequest<{ id: string }>('/api/standups/' + state.standupId + '/cards', {
    method: 'POST',
    headers: authHeaders(teamMember.token),
    body: JSON.stringify({
      yesterdaySummary: 'Finished smoke tests',
      todayCommitments: 'Share results',
      blockers: 'None',
    }),
  });
  assert.equal(cardCreate.status, 201);
  state.standupCardId = cardCreate.body.id;

  const cardUpdate = await jsonRequest<{ status: string }>('/api/standups/' + state.standupId + '/cards/' + state.standupCardId, {
    method: 'PATCH',
    headers: authHeaders(teamMember.token),
    body: JSON.stringify({
      yesterdaySummary: 'Finished smoke tests',
      todayCommitments: 'Document results',
      blockers: 'No blockers',
    }),
  });
  assert.equal(cardUpdate.status, 200);
  assert.equal(cardUpdate.body.status, 'SUBMITTED');

  const endRes = await jsonRequest<{ status: string }>('/api/standups/' + state.standupId + '/end', {
    method: 'POST',
    headers: authHeaders(manager.token),
  });
  assert.equal(endRes.status, 200);
  assert.equal(endRes.body.status, 'COMPLETED');

  const standup = await prisma.standup.findUniqueOrThrow({
    where: { id: state.standupId },
    include: { cards: true },
  });
  assert.equal(standup.status, 'COMPLETED');
  assert.equal(standup.cards.length, 1);
  assert.equal(standup.cards[0].status, 'SUBMITTED');
});
