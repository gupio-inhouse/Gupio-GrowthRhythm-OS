import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Users, Target, Zap, BookOpen,
  Building2, Settings, LogOut, BarChart3, Shield, Plug, MessageSquare, X, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import FeedbackDialog from './FeedbackDialog';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Owner Cockpit', href: '/cockpit', icon: BarChart3, roles: ['OWNER'] },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Goals & KRAs', href: '/goals', icon: Target, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'] },
  { label: 'Standup', href: '/standup', icon: Zap, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Learning', href: '/learning', icon: BookOpen, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'] },
  { label: 'Departments', href: '/departments', icon: Building2, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Team', href: '/team', icon: Users, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'] },
  { label: 'Integrations', href: '/integrations', icon: Plug, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Audit Log', href: '/audit-log', icon: ClipboardList, roles: ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'] },
  { label: 'App Feedback', href: '/app-feedback', icon: MessageSquare, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['OWNER', 'COMPANY_ADMIN'] },
  { label: 'Super Admin', href: '/superadmin', icon: Shield, roles: ['SUPER_ADMIN'] },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { pathname } = useLocation();
  const { user, org, logout } = useAuthStore();

  const visibleItems = navItems.filter((item) => item.roles.includes(user?.role || ''));

  return (
    <aside className={cn(
      'flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0',
      // Desktop: always visible; Mobile: slide in/out as overlay
      'fixed sm:relative z-50 sm:z-auto top-0 left-0',
      'transition-transform duration-200 ease-in-out',
      mobileOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
    )}>
      {/* Logo + mobile close */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary shrink-0">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-none text-sidebar-foreground">GrowthRhythm</p>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5 truncate">{org?.name || 'OS'}</p>
        </div>
        <button
          className="sm:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          onClick={onMobileClose}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onMobileClose}
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

      {/* Feedback button */}
      <div className="px-3 pb-1">
        <FeedbackDialog />
      </div>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <Avatar className="h-8 w-8 shrink-0">
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
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors shrink-0"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
