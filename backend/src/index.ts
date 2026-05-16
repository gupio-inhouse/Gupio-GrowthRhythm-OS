import { createApp } from './app';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST;
const app = createApp();

const onListen = () => {
  console.log(`🚀 GrowthRhythm API running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'test') {
    import('./services/worker').catch(console.error);
    import('./services/queues')
      .then(({ scheduleRecurringJobs }) => scheduleRecurringJobs())
      .catch(console.error);
  }
};

const server = HOST ? app.listen(PORT, HOST, onListen) : app.listen(PORT, onListen);

process.on('SIGTERM', () => server.close());

export default app;
