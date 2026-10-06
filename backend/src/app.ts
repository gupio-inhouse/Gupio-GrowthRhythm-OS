import 'dotenv/config';
// Must be imported before any routers: patches Router methods so a rejected promise in an
// async route handler is forwarded to the error middleware below, instead of silently
// hanging the request with no response until the upstream gateway times it out (504).
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRouter from './routes/auth';
import departmentsRouter from './routes/departments';
import tasksRouter from './routes/tasks';

import standupsRouter from './routes/standups';
import usersRouter from './routes/users';
import teamsRouter from './routes/teams';
import ownerRouter from './routes/owner';
import notificationsRouter from './routes/notifications';
import superAdminRouter from './routes/superadmin';
import magicRouter from './routes/magic';
import eventsRouter from './routes/events';
import uploadRouter from './routes/upload';
import mfaRouter from './routes/mfa';
import feedbackRouter from './routes/feedback';
import auditLogsRouter from './routes/auditlogs';
import learningRouter from './routes/learning';
import sopsRouter from './routes/sops';
import phasesRouter from './routes/phases';
import bugsRouter from './routes/bugs';
import reviewsRouter from './routes/reviews';
import goalsRouter from './routes/goals';
import reportsRouter from './routes/reports';
import { setOrgContext } from './middleware/rls';

export function createApp() {
  const app = express();
  const isTest = process.env.NODE_ENV === 'test';

  const envOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : ['http://localhost:5173'];

  const crmOrigins = [
    'https://crm.gps.gupio.tech',
    'https://www.crm.gps.gupio.tech',
    'https://develop.crm.gps.gupio.tech'
  ];

  const allowedOrigins = Array.from(new Set([...envOrigins, ...crmOrigins]));

  app.use(helmet());
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  if (!isTest) {
    app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
    app.use(rateLimit({ windowMs: 60 * 1000, max: 500 }));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.use('/api', setOrgContext as express.RequestHandler);

  app.use('/api/auth', authRouter);
  app.use('/api/departments', departmentsRouter);
  app.use('/api/tasks', tasksRouter);

  app.use('/api/standups', standupsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/teams', phasesRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/superadmin', superAdminRouter);
  app.use('/api/magic', magicRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/mfa', mfaRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/audit-logs', auditLogsRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/sops', sopsRouter);
  app.use('/api/bugs', bugsRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/goals', goalsRouter);
  app.use('/api/reports', reportsRouter);

  app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp;
