import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Helper function to check if the user is authorized to manage/extend phases (OWNER, COMPANY_ADMIN, or DEPARTMENT_HEAD of the project's department)
async function canManagePhases(req: AuthRequest, teamId: string) {
  const { role, userId, orgId } = req.user!;
  
  if (['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return true;
  }

  // Check if user is the department head of this project's department, or the project manager
  const team = await prisma.team.findFirst({
    where: { id: teamId, orgId },
    include: { department: true },
  });

  if (!team) return false;

  if (role === 'DEPARTMENT_HEAD' && (team.department.headUserId === userId || team.departmentHeadUserId === userId)) {
    return true;
  }

  if (team.managerUserId === userId) {
    return true;
  }

  return false;
}

// GET /teams/:teamId/phases — list all phases of a project
router.get('/:teamId/phases', async (req: AuthRequest, res: Response) => {
  const teamId = String(req.params.teamId);
  const { orgId } = req.user!;

  const phases = await prisma.projectPhase.findMany({
    where: { teamId, team: { orgId } },
    orderBy: { dueDate: 'asc' },
  });

  res.json(phases);
});

// POST /teams/:teamId/phases — create a new phase
router.post('/:teamId/phases', async (req: AuthRequest, res: Response) => {
  const teamId = String(req.params.teamId);
  const { orgId } = req.user!;

  if (!(await canManagePhases(req, teamId))) {
    res.status(403).json({ error: 'Only owners, admins, department head, or the project manager can create phases' });
    return;
  }

  const schema = z.object({
    name: z.string().min(1, 'Phase name is required').max(100),
    dueDate: z.string().datetime('Due date must be a valid ISO timestamp'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  try {
    const phase = await prisma.projectPhase.create({
      data: {
        teamId,
        name: parsed.data.name,
        dueDate: new Date(parsed.data.dueDate),
      },
    });
    res.status(201).json(phase);
  } catch (error) {
    res.status(400).json({ error: 'Phase name must be unique within the project' });
  }
});

// PATCH /teams/:teamId/phases/:phaseId — update/extend a phase deadline
router.patch('/:teamId/phases/:phaseId', async (req: AuthRequest, res: Response) => {
  const teamId = String(req.params.teamId);
  const phaseId = String(req.params.phaseId);
  const { orgId } = req.user!;

  if (!(await canManagePhases(req, teamId))) {
    res.status(403).json({ error: 'Only owners, admins, department head, or the project manager can extend phase deadlines' });
    return;
  }

  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    dueDate: z.string().datetime().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const existingPhase = await prisma.projectPhase.findFirst({
    where: { id: phaseId, teamId, team: { orgId } },
  });

  if (!existingPhase) {
    res.status(404).json({ error: 'Phase not found' });
    return;
  }

  const updateData: Record<string, any> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = new Date(parsed.data.dueDate);

  try {
    const updated = await prisma.projectPhase.update({
      where: { id: phaseId },
      data: updateData,
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Could not update phase' });
  }
});

// DELETE /teams/:teamId/phases/:phaseId — delete a phase
router.delete('/:teamId/phases/:phaseId', async (req: AuthRequest, res: Response) => {
  const teamId = String(req.params.teamId);
  const phaseId = String(req.params.phaseId);
  const { orgId } = req.user!;

  if (!(await canManagePhases(req, teamId))) {
    res.status(403).json({ error: 'Only owners, admins, department head, or the project manager can delete phases' });
    return;
  }

  const existingPhase = await prisma.projectPhase.findFirst({
    where: { id: phaseId, teamId, team: { orgId } },
  });

  if (!existingPhase) {
    res.status(404).json({ error: 'Phase not found' });
    return;
  }

  await prisma.projectPhase.delete({
    where: { id: phaseId },
  });

  res.json({ success: true });
});

export default router;
