import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Tasks from '@/pages/Tasks';
import Goals from '@/pages/Goals';
import Standup from '@/pages/Standup';
import Learning from '@/pages/Learning';
import Departments from '@/pages/Departments';
import OwnerCockpit from '@/pages/OwnerCockpit';
import Team from '@/pages/Team';
import Settings from '@/pages/Settings';
import SuperAdmin from '@/pages/SuperAdmin';
import Reviews from '@/pages/Reviews';
import MagicLinkVerify from '@/pages/MagicLinkVerify';
import Hiring from '@/pages/Hiring';
import Integrations from '@/pages/Integrations';
import AppFeedback from '@/pages/AppFeedback';
import { useAuthStore } from '@/store/authStore';
import { getRoleRedirect } from '@/lib/roleRedirect';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  return isAuthenticated
    ? <Navigate to={getRoleRedirect(user?.role || '', user?.departmentSlug)} replace />
    : <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/magic" element={<MagicLinkVerify />} />

          {/* Protected app routes */}
          <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="dashboard/:slug" element={<Dashboard />} />
            <Route path="cockpit" element={<OwnerCockpit />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="goals" element={<Goals />} />
            <Route path="standup" element={<Standup />} />
            <Route path="learning" element={<Learning />} />
            <Route path="learning/:deptSlug" element={<Learning />} />
            <Route path="departments" element={<Departments />} />
            <Route path="team" element={<Team />} />
            <Route path="calendar" element={<div className="p-8"><h1 className="text-2xl font-bold">Calendar</h1><p className="text-muted-foreground mt-2">Coming soon — connect Google Calendar in Integrations</p></div>} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="hiring" element={<Hiring />} />
            <Route path="app-feedback" element={<AppFeedback />} />
            <Route path="settings" element={<Settings />} />
            <Route path="superadmin" element={<SuperAdmin />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
