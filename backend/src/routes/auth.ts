import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(2),
  industry: z.string(),
  employeeCount: z.number().int().min(1).optional(),
  phone: z.string().optional(),
  fiscalYearStart: z.number().int().min(1).max(12).optional().default(4),
  preferredLanguage: z.string().optional().default('en'),
});

// M1.6: Industry template default departments
const INDUSTRY_TEMPLATES: Record<string, string[]> = {
  'Digital Marketing Agency': ['Strategy', 'Creative', 'Performance Marketing', 'Client Servicing', 'Operations'],
  'IT Services': ['Engineering', 'Product', 'QA', 'DevOps', 'Sales', 'Customer Success'],
  'Consulting / Coaching': ['Delivery', 'Business Development', 'Operations', 'Research & Insights'],
  'Event Management': ['Creative', 'Operations', 'Client Relations', 'Logistics', 'Marketing'],
  'Healthcare Clinic': ['Clinical', 'Administration', 'Pharmacy', 'Diagnostics', 'Front Desk'],
  'Education Business': ['Academic', 'Student Affairs', 'Administration', 'Marketing', 'Technology'],
  'Light Manufacturing': ['Production', 'Quality Control', 'Procurement', 'Sales', 'Logistics'],
  'Retail Chain': ['Store Operations', 'Inventory', 'Marketing', 'HR', 'Finance'],
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register (Owner creates company + account)
router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, email, password, companyName, industry, employeeCount, phone, fiscalYearStart, preferredLanguage } = parsed.data;

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: companyName, industry, employeeCount, fiscalYearStart, preferredLanguage },
      });

      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email,
          name,
          phone,
          role: 'OWNER',
          status: 'ACTIVE',
          passwordHash,
        },
      });

      // M1.6: auto-create default departments from industry template
      const defaultDepts = INDUSTRY_TEMPLATES[industry] ?? ['Operations', 'Sales', 'Finance'];
      for (const deptName of defaultDepts) {
        const slug = deptName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await tx.department.create({
          data: { orgId: org.id, name: deptName, slug: `${slug}-${org.id.slice(-4)}` },
        });
      }

      return { org, user };
    });

    const token = signToken({
      userId: result.user.id,
      orgId: result.org.id,
      role: result.user.role,
      email: result.user.email,
    });

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
      org: { id: result.org.id, name: result.org.name },
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Email already registered' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email },
    include: {
      org: { select: { id: true, name: true, plan: true, industry: true } },
      department: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account is not active' });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ userId: user.id, orgId: user.orgId, role: user.role, email: user.email });

  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      departmentId: user.departmentId,
      departmentSlug: user.department?.slug ?? null,
    },
    org: user.org,
  });
});

// Me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      departmentId: true, managerId: true, status: true, avatarUrl: true,
      lastLoginAt: true, createdAt: true,
      department: { select: { id: true, name: true, slug: true } },
      org: { select: { id: true, name: true, plan: true, industry: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

export default router;
