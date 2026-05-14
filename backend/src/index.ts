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
import ownerRouter from './routes/owner';
import notificationsRouter from './routes/notifications';
import superAdminRouter from './routes/superadmin';
import { setOrgContext } from './middleware/rls';
import { scheduleRecurringJobs } from './services/queues';
import './services/worker';

const app = express();
const PORT = process.env.PORT || 4000;

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));

// Body parsing & logging
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// RLS: set org context for all authenticated API routes
app.use('/api', setOrgContext as express.RequestHandler);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/kras', krasRouter);
app.use('/api/standups', standupsRouter);
app.use('/api/users', usersRouter);
app.use('/api/learning', learningRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/owner', ownerRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/superadmin', superAdminRouter);

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// 404
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 GrowthRhythm API running on http://localhost:${PORT}`);
  scheduleRecurringJobs().catch(console.error);
});

process.on('SIGTERM', () => server.close());

export default app;
