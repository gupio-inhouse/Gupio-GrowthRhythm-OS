import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import { useRealtimeUpdates } from '@/hooks/useEventSource';

export default function AppShell() {
  useRealtimeUpdates(); // M6.4: SSE realtime updates

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="h-12 border-b border-border flex items-center justify-end px-4 shrink-0">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
