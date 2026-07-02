import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Tasks from '@/pages/Tasks';
import Standup from '@/pages/Standup';
import Departments from '@/pages/Departments';
import Team from '@/pages/Team';
import Teams from '@/pages/Teams';
import IndividualReport from '@/pages/IndividualReport';
import Settings from '@/pages/Settings';
import SuperAdmin from '@/pages/SuperAdmin';
import MagicLinkVerify from '@/pages/MagicLinkVerify';
import AppFeedback from '@/pages/AppFeedback';
import AuditLog from '@/pages/AuditLog';
import DepartmentPage from '@/pages/DepartmentPage';
import LearningPage from '@/pages/LearningPage';
import LearningAdmin from '@/pages/LearningAdmin';
import LearningModuleBuilder from '@/pages/LearningModuleBuilder';
import LearningModulePage from '@/pages/LearningModulePage';
import { useAuthStore } from '@/store/authStore';
import { getRoleRedirect } from '@/lib/roleRedirect';
import { Toaster } from '@/components/ui/toaster';

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
  const location = useLocation();
  return isAuthenticated
    ? <>{children}</>
    : <Navigate to="/login" state={{ returnTo: location.pathname + location.search }} replace />;
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
            <Route path="dashboard/:slug" element={<DepartmentPage />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="standup" element={<Standup />} />
            <Route path="departments" element={<Departments />} />
            <Route path="departments/:slug" element={<DepartmentPage />} />
            <Route path="team/:userId/report" element={<IndividualReport />} />
            <Route path="team" element={<Team />} />
            <Route path="teams" element={<Teams />} />
            <Route path="app-feedback" element={<AppFeedback />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="settings" element={<Settings />} />
            <Route path="superadmin" element={<SuperAdmin />} />
            {/* Learning */}
            <Route path="learning" element={<LearningPage />} />
            <Route path="learning/modules/:id" element={<LearningModulePage />} />
            <Route path="learning/admin" element={<LearningAdmin />} />
            <Route path="learning/admin/modules/:id" element={<LearningModuleBuilder />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
