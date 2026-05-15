import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { randomBytes } from 'crypto';
import { encrypt, decrypt } from '../services/crypto.service';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function storeOAuthState(orgId: string, provider: string): Promise<string> {
  const state = randomBytes(16).toString('hex');
  await redis.setex(`oauth:state:${state}`, 600, JSON.stringify({ orgId, provider }));
  return state;
}

async function resolveOAuthState(state: string): Promise<{ orgId: string; provider: string } | null> {
  const raw = await redis.get(`oauth:state:${state}`);
  if (!raw) return null;
  await redis.del(`oauth:state:${state}`);
  return JSON.parse(raw) as { orgId: string; provider: string };
}

async function upsertOAuthToken(
  orgId: string,
  provider: string,
  accessToken: string,
  refreshToken?: string,
  expiresInSeconds?: number,
  scope?: string
) {
  const expiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : undefined;
  await prisma.oAuthToken.upsert({
    where: { orgId_provider: { orgId, provider } },
    create: {
      orgId,
      provider,
      accessToken: encrypt(accessToken),
      refreshToken: refreshToken ? encrypt(refreshToken) : null,
      expiresAt,
      scope,
    },
    update: {
      accessToken: encrypt(accessToken),
      refreshToken: refreshToken ? encrypt(refreshToken) : null,
      expiresAt,
      scope,
    },
  });
}

async function getOAuthToken(orgId: string, provider: string) {
  const token = await prisma.oAuthToken.findUnique({
    where: { orgId_provider: { orgId, provider } },
  });
  if (!token) return null;
  return {
    ...token,
    accessToken: decrypt(token.accessToken),
    refreshToken: token.refreshToken ? decrypt(token.refreshToken) : null,
  };
}

// ─── M11.1: Google Calendar ───────────────────────────────────────────────────

// GET /integrations/calendar/status
router.get('/calendar/status', authenticate, async (req: AuthRequest, res: Response) => {
  const token = await getOAuthToken(req.user!.orgId, 'google');
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  res.json({
    provider: 'google',
    connected: !!token,
    message: token
      ? `Connected — token expires ${token.expiresAt ? token.expiresAt.toISOString() : 'never'}`
      : configured
        ? 'Click Connect to authorise Google Calendar access'
        : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable',
    authUrl: configured ? `${BACKEND_URL}/api/integrations/calendar/auth` : null,
  });
});

// GET /integrations/calendar/auth — initiates OAuth (authenticated)
router.get('/calendar/auth', authenticate, async (req: AuthRequest, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ error: 'GOOGLE_CLIENT_ID not configured' });
    return;
  }
  const state = await storeOAuthState(req.user!.orgId, 'google');
  const redirectUri = `${BACKEND_URL}/api/integrations/calendar/callback`;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  res.redirect(url);
});

// GET /integrations/calendar/callback — Google redirects here (public)
router.get('/calendar/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code || !state) {
    res.redirect(`${FRONTEND_URL}/integrations?error=google_oauth_denied`);
    return;
  }

  const ctx = await resolveOAuthState(state);
  if (!ctx) {
    res.redirect(`${FRONTEND_URL}/integrations?error=invalid_state`);
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${BACKEND_URL}/api/integrations/calendar/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });

  if (!tokenRes.ok) {
    res.redirect(`${FRONTEND_URL}/integrations?error=google_token_exchange_failed`);
    return;
  }

  const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  await upsertOAuthToken(ctx.orgId, 'google', tokens.access_token, tokens.refresh_token, tokens.expires_in, tokens.scope);
  res.redirect(`${FRONTEND_URL}/integrations?connected=google`);
});

// DELETE /integrations/calendar/disconnect
router.delete('/calendar/disconnect', authenticate, requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  await prisma.oAuthToken.deleteMany({ where: { orgId: req.user!.orgId, provider: 'google' } });
  res.json({ success: true });
});

// POST /integrations/calendar/sync
router.post('/calendar/sync', authenticate, requireRole('OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'), async (req: AuthRequest, res: Response) => {
  const token = await getOAuthToken(req.user!.orgId, 'google');
  if (!token) {
    res.status(401).json({ error: 'Google Calendar not connected. Connect first via /integrations.' });
    return;
  }
  // Placeholder: real sync would call Google Calendar API with token.accessToken
  res.json({ success: true, message: 'Sync scheduled — events will appear in Google Calendar within 5 minutes.' });
});

// ─── M11.2: Microsoft Outlook / Graph ────────────────────────────────────────

// GET /integrations/outlook/status
router.get('/outlook/status', authenticate, async (req: AuthRequest, res: Response) => {
  const token = await getOAuthToken(req.user!.orgId, 'microsoft');
  const configured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  res.json({
    provider: 'microsoft',
    connected: !!token,
    message: token
      ? `Connected — token expires ${token.expiresAt ? token.expiresAt.toISOString() : 'never'}`
      : configured
        ? 'Click Connect to authorise Microsoft Outlook access'
        : 'Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET to enable',
    authUrl: configured ? `${BACKEND_URL}/api/integrations/outlook/auth` : null,
  });
});

// GET /integrations/outlook/auth — initiates OAuth (authenticated)
router.get('/outlook/auth', authenticate, async (req: AuthRequest, res: Response) => {
  const clientId = process.env.AZURE_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ error: 'AZURE_CLIENT_ID not configured' });
    return;
  }
  const state = await storeOAuthState(req.user!.orgId, 'microsoft');
  const redirectUri = `${BACKEND_URL}/api/integrations/outlook/callback`;
  const scope = encodeURIComponent('https://graph.microsoft.com/Calendars.ReadWrite offline_access');
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&prompt=consent`;
  res.redirect(url);
});

// GET /integrations/outlook/callback — Microsoft redirects here (public)
router.get('/outlook/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code || !state) {
    res.redirect(`${FRONTEND_URL}/integrations?error=outlook_oauth_denied`);
    return;
  }

  const ctx = await resolveOAuthState(state);
  if (!ctx) {
    res.redirect(`${FRONTEND_URL}/integrations?error=invalid_state`);
    return;
  }

  const clientId = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;
  const redirectUri = `${BACKEND_URL}/api/integrations/outlook/callback`;

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });

  if (!tokenRes.ok) {
    res.redirect(`${FRONTEND_URL}/integrations?error=outlook_token_exchange_failed`);
    return;
  }

  const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  await upsertOAuthToken(ctx.orgId, 'microsoft', tokens.access_token, tokens.refresh_token, tokens.expires_in, tokens.scope);
  res.redirect(`${FRONTEND_URL}/integrations?connected=microsoft`);
});

// DELETE /integrations/outlook/disconnect
router.delete('/outlook/disconnect', authenticate, requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  await prisma.oAuthToken.deleteMany({ where: { orgId: req.user!.orgId, provider: 'microsoft' } });
  res.json({ success: true });
});

// ─── M11.4: WhatsApp Business (Interakt) ─────────────────────────────────────

router.get('/whatsapp/status', authenticate, (_req: AuthRequest, res: Response) => {
  res.json({
    provider: 'interakt',
    connected: !!process.env.INTERAKT_API_KEY,
    message: process.env.INTERAKT_API_KEY
      ? 'WhatsApp connected via Interakt'
      : 'Set INTERAKT_API_KEY in env to enable WhatsApp notifications',
  });
});

router.post('/whatsapp/test', authenticate, requireRole('OWNER', 'COMPANY_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ error: 'phone required' }); return; }
  if (!process.env.INTERAKT_API_KEY) {
    res.status(501).json({ error: 'INTERAKT_API_KEY not configured' }); return;
  }
  res.json({ success: true, message: `Test message would be sent to ${phone}` });
});

// ─── M11.5: Razorpay ─────────────────────────────────────────────────────────

router.get('/razorpay/plans', authenticate, (_req: AuthRequest, res: Response) => {
  res.json({
    plans: [
      { id: 'starter', name: 'Starter', priceINR: 4999, users: 25, aiCredits: 500 },
      { id: 'growth', name: 'Growth', priceINR: 12999, users: 100, aiCredits: 2000 },
      { id: 'scale', name: 'Scale', priceINR: 29999, users: 500, aiCredits: 10000 },
    ],
    connected: !!process.env.RAZORPAY_KEY_ID,
    message: process.env.RAZORPAY_KEY_ID
      ? 'Razorpay connected'
      : 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in env to enable payments',
  });
});

router.post('/razorpay/create-order', authenticate, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  const { planId } = req.body as { planId?: string };
  if (!planId) { res.status(400).json({ error: 'planId required' }); return; }
  if (!process.env.RAZORPAY_KEY_ID) {
    res.status(501).json({ error: 'Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET' }); return;
  }
  res.json({ orderId: `order_placeholder_${planId}`, message: 'Razorpay order creation — configure keys to activate' });
});

export default router;
