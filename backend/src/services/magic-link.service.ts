import crypto from 'crypto';
import { MagicLinkPurpose } from '@prisma/client';
import { prisma } from '../lib/prisma';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
const DEFAULT_EXPIRES_HOURS = 48;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Generate ─────────────────────────────────────────────────────────────────

interface GenerateMagicLinkParams {
  userId: string;
  orgId: string;
  purpose: MagicLinkPurpose;
  expiresInHours?: number;
  metadata?: Record<string, unknown>;
}

interface MagicLinkResult {
  token: string;
  link: string;
  magicLinkId: string;
}

export async function generateMagicLink({
  userId,
  orgId,
  purpose,
  expiresInHours = DEFAULT_EXPIRES_HOURS,
  metadata,
}: GenerateMagicLinkParams): Promise<MagicLinkResult> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const magicLink = await prisma.magicLink.create({
    data: {
      userId,
      orgId,
      purpose,
      tokenHash,
      expiresAt,
      ...(metadata ? { metadata: metadata as import('@prisma/client').Prisma.InputJsonValue } : {}),
    },
  });

  const link = `${FRONTEND_URL}/magic?token=${token}`;

  return { token, link, magicLinkId: magicLink.id };
}

// ─── Verify ───────────────────────────────────────────────────────────────────

interface VerifyResult {
  magicLink: {
    id: string;
    orgId: string;
    userId: string;
    purpose: MagicLinkPurpose;
    metadata: unknown;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    orgId: string;
    status: string;
    departmentId: string | null;
    department: { id: string; name: string; slug: string } | null;
    org: { id: string; name: string; plan: string; industry: string };
  };
}

export async function verifyMagicLink(token: string): Promise<VerifyResult> {
  const tokenHash = hashToken(token);

  const magicLink = await prisma.magicLink.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          orgId: true,
          status: true,
          departmentId: true,
          department: { select: { id: true, name: true, slug: true } },
          org: { select: { id: true, name: true, plan: true, industry: true } },
        },
      },
    },
  });

  if (!magicLink) {
    throw new Error('NOT_FOUND');
  }

  if (magicLink.revokedAt) {
    throw new Error('REVOKED');
  }

  if (magicLink.usedAt) {
    throw new Error('USED');
  }

  if (magicLink.expiresAt < new Date()) {
    throw new Error('EXPIRED');
  }

  return {
    magicLink: {
      id: magicLink.id,
      orgId: magicLink.orgId,
      userId: magicLink.userId,
      purpose: magicLink.purpose,
      metadata: magicLink.metadata,
    },
    user: magicLink.user,
  };
}

// ─── Consume ──────────────────────────────────────────────────────────────────

export async function consumeMagicLink(magicLinkId: string): Promise<void> {
  await prisma.magicLink.update({
    where: { id: magicLinkId },
    data: { usedAt: new Date() },
  });
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

export async function revokeMagicLink(magicLinkId: string): Promise<void> {
  await prisma.magicLink.update({
    where: { id: magicLinkId },
    data: { revokedAt: new Date() },
  });
}
