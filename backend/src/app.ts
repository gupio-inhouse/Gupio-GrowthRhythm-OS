import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRouter from './routes/auth';
import departmentsRouter from './routes/departments';
import tasksRouter from './routes/tasks';
import krasRouter from './routes/kras';
import standupsRouter from './routes/standups';
import usersRouter from './routes/users';
import learningRouter from './routes/learning';
import goalsRouter from './routes/goals';
import teamsRouter from './routes/teams';
import ownerRouter from './routes/owner';
import notificationsRouter from './routes/notifications';
import superAdminRouter from './routes/superadmin';
import reviewsRouter from './routes/reviews';
import hiringRouter from './routes/hiring';
import magicRouter from './routes/magic';
import eventsRouter from './routes/events';
import integrationsRouter from './routes/integrations';
import uploadRouter from './routes/upload';
import mfaRouter from './routes/mfa';
import { setOrgContext } from './middleware/rls';

export function createApp() {
  const app = express();
  const isTest = process.env.NODE_ENV === 'test';

  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));

  if (!isTest) {
    app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
    app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.use('/api', setOrgContext as express.RequestHandler);

  app.use('/api/auth', authRouter);
  app.use('/api/departments', departmentsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/kras', krasRouter);
  app.use('/api/standups', standupsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/goals', goalsRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/superadmin', superAdminRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/hiring', hiringRouter);
  app.use('/api/magic', magicRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/uploads', express.static('uploads'));
  app.use('/api/mfa', mfaRouter);

  app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp;
