import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const EDITOR_ROLES = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'];

function canEdit(role: string) {
  return EDITOR_ROLES.includes(role);
}

// GET /sops/:departmentId — list all SOPs for a department
router.get('/:departmentId', async (req: AuthRequest, res: Response) => {
  const { departmentId } = req.params;
  const { orgId, role, userId } = req.user!;

  // Role-based visibility check
  const isOwnerLevel = ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role);
  if (!isOwnerLevel) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    if (user?.departmentId !== departmentId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
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
  if (!canEdit(role)) { res.status(403).json({ error: 'Only owners and department heads can create SOPs' }); return; }

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
      departmentId: req.params.departmentId,
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

// PATCH /sops/:departmentId/:sopId — update a SOP
router.patch('/:departmentId/:sopId', async (req: AuthRequest, res: Response) => {
  const { role, orgId, userId } = req.user!;
  if (!canEdit(role)) { res.status(403).json({ error: 'Only owners and department heads can edit SOPs' }); return; }

  const sop = await prisma.departmentSop.findFirst({
    where: { id: req.params.sopId, departmentId: req.params.departmentId, orgId },
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
  const { role, orgId } = req.user!;
  if (!canEdit(role)) { res.status(403).json({ error: 'Only owners and department heads can delete SOPs' }); return; }

  const sop = await prisma.departmentSop.findFirst({
    where: { id: req.params.sopId, departmentId: req.params.departmentId, orgId },
  });
  if (!sop) { res.status(404).json({ error: 'SOP not found' }); return; }

  await prisma.departmentSop.delete({ where: { id: sop.id } });
  res.json({ success: true });
});

export default router;
