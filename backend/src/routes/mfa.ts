import { Router, Response } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// POST /mfa/setup — generate TOTP secret + QR code
router.post('/setup', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { email: true, mfaEnabled: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  if (user.mfaEnabled) { res.status(400).json({ error: 'MFA already enabled' }); return; }

  const secret = speakeasy.generateSecret({
    name: `GrowthRhythm (${user.email})`,
    length: 20,
  });

  // Store temp secret (not yet enabled — user must verify first)
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { mfaSecret: secret.base32 },
  });

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

  res.json({
    secret: secret.base32,
    qrCode: qrCodeDataUrl,
    message: 'Scan the QR code with your authenticator app, then verify with POST /mfa/verify-setup',
  });
});

// POST /mfa/verify-setup — confirm TOTP and enable MFA
router.post('/verify-setup', async (req: AuthRequest, res: Response) => {
  const { code } = req.body as { code: string };
  if (!code) { res.status(400).json({ error: 'TOTP code required' }); return; }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { mfaSecret: true, mfaEnabled: true },
  });
  if (!user?.mfaSecret) { res.status(400).json({ error: 'MFA setup not started. Call POST /mfa/setup first.' }); return; }
  if (user.mfaEnabled) { res.status(400).json({ error: 'MFA already enabled' }); return; }

  const valid = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 1,
  });

  if (!valid) { res.status(401).json({ error: 'Invalid TOTP code' }); return; }

  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { mfaEnabled: true },
  });

  res.json({ success: true, message: 'MFA enabled successfully' });
});

// POST /mfa/verify — verify TOTP code (called during sensitive actions)
router.post('/verify', async (req: AuthRequest, res: Response) => {
  const { code } = req.body as { code: string };
  if (!code) { res.status(400).json({ error: 'TOTP code required' }); return; }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { mfaSecret: true, mfaEnabled: true },
  });
  if (!user?.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ error: 'MFA not enabled for this account' }); return;
  }

  const valid = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 1,
  });

  if (!valid) { res.status(401).json({ error: 'Invalid TOTP code' }); return; }

  res.json({ success: true, verified: true });
});

// DELETE /mfa/disable — disable MFA (requires TOTP verification)
router.delete('/disable', async (req: AuthRequest, res: Response) => {
  const { code } = req.body as { code: string };
  if (!code) { res.status(400).json({ error: 'Current TOTP code required to disable MFA' }); return; }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { mfaSecret: true, mfaEnabled: true },
  });
  if (!user?.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ error: 'MFA not enabled' }); return;
  }

  const valid = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!valid) { res.status(401).json({ error: 'Invalid TOTP code' }); return; }

  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { mfaEnabled: false, mfaSecret: null },
  });

  res.json({ success: true, message: 'MFA disabled' });
});

export default router;
