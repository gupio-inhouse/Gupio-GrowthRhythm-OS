import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { generateMagicLink, verifyMagicLink, consumeMagicLink, revokeMagicLink } from '../services/magic-link.service';

// Re-export for convenience so callers can also use generateMagicLink from here
export { generateMagicLink };

const router = Router();

// ─── POST /magic/verify — public ─────────────────────────────────────────────
const verifySchema = z.object({ token: z.string().min(1) });

router.post('/verify', async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const { token } = parsed.data;

  let verifyResult: Awaited<ReturnType<typeof verifyMagicLink>>;

  try {
    verifyResult = await verifyMagicLink(token);
  } catch (err) {
    const msg = (err as Error).message;
    const statusMap: Record<string, number> = {
      EXPIRED: 410,
      USED: 410,
      REVOKED: 410,
      NOT_FOUND: 404,
    };
    const status = statusMap[msg] ?? 400;
    const readable: Record<string, string> = {
      EXPIRED: 'This magic link has expired. Please request a new one.',
      USED: 'This magic link has already been used.',
      REVOKED: 'This magic link has been revoked.',
      NOT_FOUND: 'Magic link not found.',
    };
    res.status(status).json({ error: readable[msg] ?? 'Invalid magic link.' });
    return;
  }

  const { magicLink, user } = verifyResult;

  // Mark as consumed
  await consumeMagicLink(magicLink.id);

  // Activate user if they were INVITED
  if (user.status === 'INVITED') {
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE', lastLoginAt: new Date() },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  }

  // Audit log — fire and forget
  prisma.auditLog
    .create({
      data: {
        orgId: user.orgId,
        userId: user.id,
        entityType: 'magic_link',
        entityId: magicLink.id,
        action: 'LOGIN',
        after: { purpose: magicLink.purpose, userId: user.id },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    })
    .catch(console.error);

  const jwtToken = signToken({
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    email: user.email,
  });

  res.json({
    token: jwtToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      departmentSlug: user.department?.slug ?? null,
    },
    org: user.org,
  });
});

// ─── POST /magic/revoke — authenticated, OWNER/COMPANY_ADMIN ─────────────────
const revokeSchema = z.object({ magicLinkId: z.string().min(1) });

router.post(
  '/revoke',
  authenticate,
  requireRole('OWNER', 'COMPANY_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'magicLinkId is required' });
      return;
    }

    const { magicLinkId } = parsed.data;

    // Ensure the magic link belongs to this org
    const existing = await prisma.magicLink.findFirst({
      where: { id: magicLinkId, orgId: req.user!.orgId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Magic link not found' });
      return;
    }

    if (existing.revokedAt) {
      res.status(409).json({ error: 'Magic link already revoked' });
      return;
    }

    await revokeMagicLink(magicLinkId);

    // Audit log — fire and forget
    prisma.auditLog
      .create({
        data: {
          orgId: req.user!.orgId,
          userId: req.user!.userId,
          entityType: 'magic_link',
          entityId: magicLinkId,
          action: 'REVOKE',
          after: { revokedBy: req.user!.userId },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      })
      .catch(console.error);

    res.json({ success: true, magicLinkId });
  }
);

// ─── GET /magic/links — authenticated, OWNER/COMPANY_ADMIN ───────────────────

router.get(
  '/links',
  authenticate,
  requireRole('OWNER', 'COMPANY_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    const links = await prisma.magicLink.findMany({
      where: { orgId: req.user!.orgId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const now = new Date();

    const result = links.map((link) => {
      let status: 'active' | 'used' | 'revoked' | 'expired';
      if (link.revokedAt) {
        status = 'revoked';
      } else if (link.usedAt) {
        status = 'used';
      } else if (link.expiresAt < now) {
        status = 'expired';
      } else {
        status = 'active';
      }

      return {
        id: link.id,
        purpose: link.purpose,
        status,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        usedAt: link.usedAt,
        revokedAt: link.revokedAt,
        user: link.user,
      };
    });

    res.json(result);
  }
);

export default router;
