import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserDeptAccess } from '../lib/deptAccess';
import { beautifySopContent } from '../services/ai.service';

const router = Router();
router.use(authenticate);

const EDITOR_ROLES = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'];

function canEdit(role: string) {
  return EDITOR_ROLES.includes(role);
}

// Mirrors the department-detail access check in routes/departments.ts: owner-level roles
// see everything, others need either a matching home department or a UserDepartmentGrant
// (FULL or SPECIFIC-with-this-department) — e.g. a COO granted cross-department access.
async function canAccessDepartment(userId: string, orgId: string, role: string, departmentId: string) {
  if (['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role)) return true;

  const access = await getUserDeptAccess(userId, orgId, role);
  if (access?.accessType === 'FULL') return true;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  if (user?.departmentId === departmentId) return true;

  return access?.accessType === 'SPECIFIC' && access.departmentIds.includes(departmentId);
}

// GET /sops/:departmentId — list all SOPs for a department
router.get('/:departmentId', async (req: AuthRequest, res: Response) => {
  const departmentId = String(req.params.departmentId);
  const { orgId, role, userId } = req.user!;

  if (!(await canAccessDepartment(userId, orgId, role, departmentId))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const sops = await prisma.departmentSop.findMany({
    where: { departmentId, orgId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      content: true,
      order: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  res.json(sops);
});

// POST /sops/:departmentId — create a new SOP
router.post('/:departmentId', async (req: AuthRequest, res: Response) => {
  const { role, orgId, userId } = req.user!;
  const departmentId = String(req.params.departmentId);
  if (!canEdit(role)) { res.status(403).json({ error: 'Only owners and department heads can create SOPs' }); return; }
  if (!(await canAccessDepartment(userId, orgId, role, departmentId))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const schema = z.object({
    title:   z.string().min(1, 'Title is required').max(200),
    content: z.string().default(''),
    order:   z.number().int().default(0),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

  const sop = await prisma.departmentSop.create({
    data: {
      orgId,
      departmentId,
      title:        parsed.data.title,
      content:      parsed.data.content,
      order:        parsed.data.order,
      createdById:  userId,
    },
    select: {
      id: true, title: true, content: true, order: true, createdAt: true, updatedAt: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy:  { select: { id: true, name: true } },
    },
  });

  res.status(201).json(sop);
});

// POST /sops/:departmentId/beautify — AI-formats existing content (colors/bold/highlights/
// headings only); the wording is verified byte-for-byte unchanged before it's returned.
router.post('/:departmentId/beautify', async (req: AuthRequest, res: Response) => {
  const { role, orgId, userId } = req.user!;
  const departmentId = String(req.params.departmentId);
  if (!canEdit(role)) { res.status(403).json({ error: 'Only owners and department heads can use AI beautify' }); return; }
  if (!(await canAccessDepartment(userId, orgId, role, departmentId))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const schema = z.object({ content: z.string().min(1, 'Nothing to beautify') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

  try {
    const result = await beautifySopContent(orgId, parsed.data.content);
    if (!result.ok) {
      if (result.reason === 'insufficient_credits') {
        res.status(402).json({ error: 'Insufficient AI credits' });
      } else if (result.reason === 'ai_unavailable') {
        res.status(503).json({ error: 'The AI service is temporarily unavailable. Please try again in a moment.' });
      } else {
        res.status(422).json({ error: 'AI beautification would have changed the wording, so it was discarded to keep your content unchanged. Please try again.' });
      }
      return;
    }
    res.json({ content: result.content });
  } catch (err) {
    console.error('[sops] beautify route failed unexpectedly:', err);
    res.status(503).json({ error: 'The AI service is temporarily unavailable. Please try again in a moment.' });
  }
});

// PATCH /sops/:departmentId/:sopId — update a SOP
router.patch('/:departmentId/:sopId', async (req: AuthRequest, res: Response) => {
  const { role, orgId, userId } = req.user!;
  if (!canEdit(role)) { res.status(403).json({ error: 'Only owners and department heads can edit SOPs' }); return; }

  const deptId = String(req.params.departmentId);
  const sopId  = String(req.params.sopId);
  if (!(await canAccessDepartment(userId, orgId, role, deptId))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const sop = await prisma.departmentSop.findFirst({
    where: { id: sopId, departmentId: deptId, orgId },
  });
  if (!sop) { res.status(404).json({ error: 'SOP not found' }); return; }

  const schema = z.object({
    title:   z.string().min(1).max(200).optional(),
    content: z.string().optional(),
    order:   z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }

  const updated = await prisma.departmentSop.update({
    where: { id: sop.id },
    data: { ...parsed.data, updatedById: userId },
    select: {
      id: true, title: true, content: true, order: true, createdAt: true, updatedAt: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy:  { select: { id: true, name: true } },
    },
  });

  res.json(updated);
});

// DELETE /sops/:departmentId/:sopId
router.delete('/:departmentId/:sopId', async (req: AuthRequest, res: Response) => {
  const { role, orgId, userId } = req.user!;
  if (!canEdit(role)) { res.status(403).json({ error: 'Only owners and department heads can delete SOPs' }); return; }

  const deptId = String(req.params.departmentId);
  const sopId  = String(req.params.sopId);
  if (!(await canAccessDepartment(userId, orgId, role, deptId))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const sop = await prisma.departmentSop.findFirst({
    where: { id: sopId, departmentId: deptId, orgId },
  });
  if (!sop) { res.status(404).json({ error: 'SOP not found' }); return; }

  await prisma.departmentSop.delete({ where: { id: sop.id } });
  res.json({ success: true });
});

export default router;
