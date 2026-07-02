import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../lib/prisma';
import { AuditAction } from '@prisma/client';
// mncmxn
export function auditLog(entityType: string, action: AuditAction) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (data: unknown) => {
      if (req.user && res.statusCode < 400) {
        prisma.auditLog
          .create({
            data: {
              orgId: req.user.orgId,
              userId: req.user.userId,
              entityType,
              entityId: (req.params.id as string) || 'bulk',
              action,
              after: data as object,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          })
          .catch(console.error);
      }
      return originalJson(data);
    };
    next();
  };
}
