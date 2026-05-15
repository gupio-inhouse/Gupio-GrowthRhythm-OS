import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { verifyToken } from '../lib/jwt';

const router = Router();

// SSE supports auth via query param ?token= (EventSource doesn't support headers)
function authenticateSse(req: Request, res: Response, next: () => void) {
  const token = (req.query.token as string) || req.headers.authorization?.slice(7);
  if (!token) { res.status(401).end(); return; }
  try {
    (req as AuthRequest).user = verifyToken(token);
    next();
  } catch { res.status(401).end(); }
}

// In-memory store of active SSE connections per org
const connections = new Map<string, Set<Response>>();

// Publish event to all org connections (called internally)
export function publishEvent(orgId: string, event: string, data: unknown) {
  const orgConns = connections.get(orgId);
  if (!orgConns || orgConns.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of orgConns) {
    try { res.write(payload); } catch { /* connection may have closed */ }
  }
}

// GET /events — SSE stream (M6.4: realtime updates)
router.get('/', authenticateSse, (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Register connection
  if (!connections.has(orgId)) connections.set(orgId, new Set());
  connections.get(orgId)!.add(res);

  // Send initial heartbeat
  res.write(`event: connected\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);

  // Heartbeat every 25s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); }
  }, 25_000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    connections.get(orgId)?.delete(res);
  });
});

export default router;
