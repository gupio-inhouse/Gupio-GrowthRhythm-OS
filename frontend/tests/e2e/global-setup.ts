import fs from 'node:fs/promises';

import bcrypt from '../../../backend/node_modules/bcryptjs/index.js';
import prismaModule from '../../../backend/dist/lib/prisma';

import { E2E_PASSWORD, E2E_STATE_PATH, type E2EState } from './state';

const prisma = (prismaModule as typeof prismaModule & { default?: typeof prismaModule }).default ?? prismaModule;

async function post<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`POST ${url} failed with ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export default async function globalSetup() {
  const runId = `ui-${Date.now()}`;
  const ownerEmail = `${runId}.owner@example.com`;

  const registerRes = await post<{
    token: string;
    user: { id: string; email: string };
    org: { id: string; name: string };
  }>('http://127.0.0.1:4000/api/auth/register', {
    name: 'UI Owner',
    email: ownerEmail,
    password: E2E_PASSWORD,
    companyName: `UI Flow Org ${runId}`,
    industry: 'IT Services',
    employeeCount: 20,
    fiscalYearStart: 4,
    preferredLanguage: 'en',
  });

  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: registerRes.user.id },
    select: { id: true },
  });
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: registerRes.org.id },
    include: { departments: { orderBy: { createdAt: 'asc' } } },
  });
  const department = org.departments[0];
  if (!department) throw new Error('No department created during UI setup');

  const roleEmails = {
    departmentHead: `${runId}.head@example.com`,
    manager: `${runId}.manager@example.com`,
    teamMember: `${runId}.member@example.com`,
    coach: `${runId}.coach@example.com`,
    companyAdmin: `${runId}.admin@example.com`,
    superAdmin: `${runId}.super@example.com`,
  };

  const invites = [
    { name: 'UI Department Head', email: roleEmails.departmentHead, role: 'DEPARTMENT_HEAD' },
    { name: 'UI Manager', email: roleEmails.manager, role: 'MANAGER' },
    { name: 'UI Team Member', email: roleEmails.teamMember, role: 'TEAM_MEMBER' },
    { name: 'UI Coach', email: roleEmails.coach, role: 'COACH_ADVISOR' },
  ] as const;

  const createdIds: Record<string, string> = {};

  for (const invite of invites) {
    const body: Record<string, string> = {
      name: invite.name,
      email: invite.email,
      role: invite.role,
      departmentId: department.id,
      phone: '9999999999',
    };
    if (invite.role === 'TEAM_MEMBER') {
      const managerId = createdIds.MANAGER;
      if (!managerId) throw new Error('Manager must exist before inviting team member');
      body.managerId = managerId;
    }

    const result = await post<{ id: string }>(
      'http://127.0.0.1:4000/api/users/invite',
      body,
      registerRes.token
    );
    createdIds[invite.role] = result.id;
  }

  const bulkImportRes = await fetch('http://127.0.0.1:4000/api/users/bulk-import', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${registerRes.token}`,
    },
    body: JSON.stringify({
      rows: [
        {
          name: 'UI Company Admin',
          email: roleEmails.companyAdmin,
          role: 'COMPANY_ADMIN',
          phone: '8888888888',
          departmentId: department.id,
        },
      ],
    }),
  });
  if (!bulkImportRes.ok) {
    throw new Error(`Bulk import failed: ${await bulkImportRes.text()}`);
  }

  const companyAdmin = await prisma.user.findFirstOrThrow({
    where: { orgId: org.id, email: roleEmails.companyAdmin },
    select: { id: true },
  });

  const passwordHash = await bcrypt.hash(E2E_PASSWORD, 12);

  await prisma.user.updateMany({
    where: {
      id: {
        in: [
          owner.id,
          createdIds.DEPARTMENT_HEAD,
          createdIds.MANAGER,
          createdIds.TEAM_MEMBER,
          createdIds.COACH_ADVISOR,
          companyAdmin.id,
        ],
      },
    },
    data: {
      status: 'ACTIVE',
      passwordHash,
    },
  });

  await prisma.department.update({
    where: { id: department.id },
    data: { headUserId: createdIds.DEPARTMENT_HEAD },
  });

  const superAdmin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: roleEmails.superAdmin,
      name: 'UI Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      passwordHash,
    },
    select: { id: true },
  });

  const state: E2EState = {
    runId,
    orgId: org.id,
    departmentId: department.id,
    departmentName: department.name,
    departmentSlug: department.slug,
    users: {
      owner: ownerEmail,
      companyAdmin: roleEmails.companyAdmin,
      departmentHead: roleEmails.departmentHead,
      manager: roleEmails.manager,
      teamMember: roleEmails.teamMember,
      coach: roleEmails.coach,
      superAdmin: roleEmails.superAdmin,
    },
  };

  await fs.writeFile(E2E_STATE_PATH, JSON.stringify(state), 'utf8');
}
