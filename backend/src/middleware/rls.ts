import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from './auth';

// Sets app.current_org_id for the current transaction so that PostgreSQL RLS
// policies can enforce tenant isolation at the database layer.
//
// NOTE: Prisma uses a connection pool, so SET LOCAL only affects the current
// transaction. This middleware is a best-effort supplement — application-level
// orgId filtering in every Prisma query remains the primary defence.
export async function setOrgContext(req: AuthRequest, res: Response, next: NextFunction) {
  const orgId = req.user?.orgId;
  if (orgId && /^[a-zA-Z0-9_-]+$/.test(orgId)) {
    try {
      await prisma.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${orgId}'`);
    } catch {
      // Non-fatal — application-level orgId filtering is the primary defense
    }
  }
  next();
}
