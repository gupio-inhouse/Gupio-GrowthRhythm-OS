import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import { useRealtimeUpdates } from '@/hooks/useEventSource';

export default function AppShell() {
  useRealtimeUpdates();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
          <button
            className="sm:hidden p-1 rounded-md hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
