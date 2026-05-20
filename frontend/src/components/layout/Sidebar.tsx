import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Users, Target, Zap, BookOpen,
  Building2, Settings, LogOut, BarChart3, Calendar, Shield, ClipboardList, Users2, Plug, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import FeedbackDialog from './FeedbackDialog';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Owner Cockpit', href: '/cockpit', icon: BarChart3, roles: ['OWNER'] },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Goals & KRAs', href: '/goals', icon: Target, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'] },
  { label: 'Standup', href: '/standup', icon: Zap, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Learning', href: '/learning', icon: BookOpen, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Departments', href: '/departments', icon: Building2, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Calendar', href: '/calendar', icon: Calendar, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Reviews', href: '/reviews', icon: ClipboardList, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'] },
  { label: 'Hiring', href: '/hiring', icon: Users2, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'] },
  { label: 'Team', href: '/team', icon: Users, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'] },
  { label: 'Integrations', href: '/integrations', icon: Plug, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'App Feedback', href: '/app-feedback', icon: MessageSquare, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Super Admin', href: '/superadmin', icon: Shield, roles: ['SUPER_ADMIN'] },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const { user, org, logout } = useAuthStore();

  const visibleItems = navItems.filter((item) => item.roles.includes(user?.role || ''));

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none text-sidebar-foreground">GrowthRhythm</p>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5">{org?.name || 'OS'}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Feedback button — visible to all roles */}
      <div className="px-3 pb-1">
        <FeedbackDialog />
      </div>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback className="bg-sidebar-primary text-white text-xs">
              {getInitials(user?.name || 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate capitalize">
              {user?.role?.toLowerCase().replace('_', ' ')}
            </p>
          </div>
          <button
            onClick={logout}
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
