import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2, Users, CheckSquare, AlertTriangle, Clock, Zap,
  TrendingUp, Plus, Pencil, Trash2, UserPlus, UserMinus,
  ChevronDown, ChevronUp, ChevronLeft, X, FolderKanban, ChevronRight,
  BarChart2, ArrowLeft, ClipboardList, Filter, FileText, Link2, Upload, Star,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, getInitials, formatDate, formatRelative, priorityColor, statusColor } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';

// ── Types ─────────────────────────────────────────────────────────────────────

type DeptMember = { id: string; name: string; email: string; role: string; status: string; avatarUrl?: string };
type DeptDetail = {
  id: string; name: string; slug: string;
  standupTime?: string; standupDuration?: number;
  head?: { id: string; name: string; email: string; avatarUrl?: string };
  users: DeptMember[];
  _count: { tasks: number; standups: number };
};
type DeptDash = {
  overdueCount: number; blockedCount: number; dueTodayCount: number; memberCount: number;
  recentStandup: { id: string; status: string; scheduledAt: string; _count: { cards: number } } | null;
  topBlockers: Array<{ blockerType: string | null; _count: number }>;
};
type DeptTask = {
  id: string; title: string; status: string; priority: string;
  dueDate?: string; description?: string; blockerType?: string;
  assignee?: { id: string; name: string; avatarUrl?: string };
  department?: { id: string; name: string };
};
type TeamUser   = { id: string; name: string; email: string; role: string; avatarUrl?: string };
type TeamMember = { id: string; joinedAt: string; user: TeamUser };
type Team = {
  id: string; name: string; slug: string; description?: string;
  department: { id: string; name: string; slug: string };
  managerUserId?: string; manager?: TeamUser; departmentHead?: TeamUser;
  members: TeamMember[]; memberCount: number;
};
type TaskSummary = { id: string; title: string; status: string; priority: string; dueDate?: string; assigneeUserId: string };
type MemberStat = {
  user: TeamUser; joinedAt: string;
  stats: { total: number; done: number; inProgress: number; inReview: number; blocked: number; todo: number; overdue: number; completionRate: number };
  tasks: TaskSummary[];
};
type ProjectOverview = { team: Team; stats: MemberStat['stats']; memberStats: MemberStat[] };
type OrgUser = { id: string; name: string; email: string; avatarUrl?: string; role: string; departmentId?: string };
type TeamDoc = {
  id: string; name: string; url: string; fileType?: string; size?: number; createdAt: string;
  uploadedBy: { id: string; name: string; avatarUrl?: string };
};

type TaskFilter = 'all' | 'overdue' | 'blocked' | 'in_progress' | 'in_review' | 'done' | 'todo';
type ActiveTab  = 'overview' | 'projects' | 'tasks' | 'members';

const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked',
  IN_REVIEW: 'In Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    OWNER: 'bg-amber-100 text-amber-700', COMPANY_ADMIN: 'bg-purple-100 text-purple-700',
    DEPARTMENT_HEAD: 'bg-blue-100 text-blue-700', MANAGER: 'bg-teal-100 text-teal-700',
    TEAM_MEMBER: 'bg-gray-100 text-gray-600',   COACH_ADVISOR: 'bg-indigo-100 text-indigo-700',
  };
  const labels: Record<string, string> = {
    OWNER: 'Owner', COMPANY_ADMIN: 'Admin', DEPARTMENT_HEAD: 'Dept Head',
    MANAGER: 'Manager', TEAM_MEMBER: 'Member', COACH_ADVISOR: 'Advisor',
  };
  return (
    <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', map[role] ?? 'bg-gray-100 text-gray-600')}>
      {labels[role] ?? role}
    </span>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const color = value >= 75 ? 'bg-green-500' : value >= 40 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className={cn('w-full rounded-full bg-muted h-2', className)}>
      <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DepartmentPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate    = useNavigate();
  const { user }    = useAuthStore();
  const qc          = useQueryClient();
  const canManage   = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canAdmin    = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');

  const { data: dept, isLoading: deptLoading } = useQuery<DeptDetail>({
    queryKey: ['dept-detail', slug],
    queryFn:  () => api.get(`/departments/${slug}`).then((r) => r.data),
    enabled:  !!slug,
  });
  const { data: dash } = useQuery<DeptDash>({
    queryKey: ['dept-dashboard', slug],
    queryFn:  () => api.get(`/departments/${slug}/dashboard`).then((r) => r.data),
    enabled:  !!slug,
  });
  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn:  () => api.get('/teams').then((r) => r.data),
  });
  const { data: deptTasks = [], isLoading: tasksLoading } = useQuery<DeptTask[]>({
    queryKey: ['tasks', 'dept', dept?.id],
    queryFn:  () => api.get(`/tasks?departmentId=${dept!.id}`).then((r) => r.data),
    enabled:  !!dept?.id,
  });

  const deptTeams = allTeams.filter((t) => t.department.slug === slug);

  const [activeTab,      setActiveTab]      = useState<ActiveTab>('overview');
  const [taskFilter,     setTaskFilter]     = useState<TaskFilter>('all');
  const [deptTasksPage,  setDeptTasksPage]  = useState(1);
  const [selectedTeam,   setSelectedTeam]   = useState<Team | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [memberDialog,   setMemberDialog]   = useState<DeptMember | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const deleteTeam = useMutation({
    mutationFn: (id: string) => api.delete(`/teams/${id}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['teams'] }); setSelectedTeam(null); },
  });

  // Navigate to tasks tab with a preset filter
  const openTasksFiltered = (filter: TaskFilter) => {
    setTaskFilter(filter);
    setDeptTasksPage(1);
    setActiveTab('tasks');
  };

  const now = new Date();
  const filteredTasks = deptTasks.filter((t) => {
    if (taskFilter === 'all')         return true;
    if (taskFilter === 'overdue')     return !!t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED';
    if (taskFilter === 'blocked')     return t.status === 'BLOCKED';
    if (taskFilter === 'in_progress') return t.status === 'IN_PROGRESS';
    if (taskFilter === 'in_review')   return t.status === 'IN_REVIEW';
    if (taskFilter === 'done')        return t.status === 'DONE';
    if (taskFilter === 'todo')        return t.status === 'TODO';
    return true;
  });

  if (deptLoading || !dept) {
    return (
      <div className="p-4 sm:p-8 space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
      </div>
    );
  }

  // TEAM_MEMBERs see only their project — manager first, then regular member
  if (user?.role === 'TEAM_MEMBER') {
    const myTeam =
      deptTeams.find((t) => t.managerUserId === user.id) ||
      deptTeams.find((t) => t.members.some((m) => m.user.id === user.id));
    if (myTeam) {
      return (
        <div className="p-4 sm:p-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            My Dashboard
          </button>
          <ProjectFullView
            team={myTeam}
            canManage={false}
            deptId={dept.id}
            onBack={() => navigate('/dashboard')}
            hideBack
            onUpdated={(updated) => { qc.invalidateQueries({ queryKey: ['teams'] }); }}
            onDelete={() => {}}
            isDeleting={false}
            onViewMember={() => {}}
          />
          {memberDialog && (
            <MemberDetailDialog
              member={memberDialog}
              tasks={deptTasks.filter((t) => t.assignee?.id === memberDialog.id)}
              onClose={() => setMemberDialog(null)}
            />
          )}
        </div>
      );
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Breadcrumb — only external link allowed */}
      <Link to="/departments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        All Departments
      </Link>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100">
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{dept.name}</h1>
              <p className="text-sm text-muted-foreground">Department Dashboard</p>
            </div>
          </div>
          {dept.head && (
            <div className="flex items-center gap-2 ml-14">
              <Avatar className="h-6 w-6">
                <AvatarImage src={dept.head.avatarUrl} />
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(dept.head.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">{dept.head.name}</span>
              <RoleBadge role="DEPARTMENT_HEAD" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {[
            { icon: Users,        value: dept.users.length,   label: 'members',  tab: 'members'  as ActiveTab },
            { icon: FolderKanban, value: deptTeams.length,    label: 'projects', tab: 'projects' as ActiveTab },
            { icon: CheckSquare,  value: dept._count.tasks,   label: 'tasks',    tab: 'tasks'    as ActiveTab },
          ].map(({ icon: Icon, value, label, tab }) => (
            <button
              key={label}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 hover:border-primary/40 hover:bg-muted/40 transition-all"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">
            Projects
            {deptTeams.length > 0 && (
              <span className="ml-1.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5">
                {deptTeams.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks
            {deptTasks.length > 0 && (
              <span className="ml-1.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5">
                {deptTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="members">
            Members
            {dept.users.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5">
                {dept.users.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Stat cards — click to open Tasks tab with filter */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Overdue Tasks', value: dash?.overdueCount ?? 0,   icon: Clock,          color: 'text-red-500',    bg: 'bg-red-50',    filter: 'overdue'     as TaskFilter },
              { label: 'Blocked',       value: dash?.blockedCount ?? 0,   icon: AlertTriangle,  color: 'text-orange-500', bg: 'bg-orange-50', filter: 'blocked'     as TaskFilter },
              { label: 'Due Today',     value: dash?.dueTodayCount ?? 0,  icon: CheckSquare,    color: 'text-blue-500',   bg: 'bg-blue-50',   filter: 'in_progress' as TaskFilter },
            ].map(({ label, value, icon: Icon, color, bg, filter }) => (
              <button
                key={label}
                onClick={() => openTasksFiltered(filter)}
                className="text-left"
              >
                <Card className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="text-3xl font-bold mt-1">{value}</p>
                        <p className="text-xs text-primary mt-1">View in Tasks →</p>
                      </div>
                      <div className={cn('p-2.5 rounded-lg', bg)}>
                        <Icon className={cn('h-5 w-5', color)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          {/* Overdue alert banner */}
          {(dash?.overdueCount ?? 0) > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span className="font-semibold text-sm text-red-800">
                  {dash!.overdueCount} overdue task{dash!.overdueCount > 1 ? 's' : ''} need attention
                </span>
              </div>
              <button
                onClick={() => openTasksFiltered('overdue')}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                View tasks →
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Blocker types */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Blocker Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!dash?.topBlockers?.length ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No blockers — great!</div>
                ) : (
                  <div className="space-y-3">
                    {dash.topBlockers.map((b) => (
                      <button
                        key={b.blockerType ?? 'null'}
                        onClick={() => openTasksFiltered('blocked')}
                        className="w-full flex items-center justify-between hover:bg-muted/40 px-2 py-1 rounded-lg transition-colors"
                      >
                        <p className="text-sm capitalize">{(b.blockerType ?? 'unknown').toLowerCase().replace(/_/g, ' ')}</p>
                        <Badge variant="destructive" className="text-xs">{b._count}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Last standup — inline, no external link */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Last Standup
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dash?.recentStandup ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{formatDate(dash.recentStandup.scheduledAt)}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{dash.recentStandup._count.cards} participants</span>
                      <Badge className={cn('text-xs', {
                        'bg-green-100 text-green-700': dash.recentStandup.status === 'COMPLETED',
                        'bg-blue-100 text-blue-700':  dash.recentStandup.status === 'IN_PROGRESS',
                        'bg-gray-100 text-gray-600':  dash.recentStandup.status === 'SCHEDULED',
                      })}>
                        {dash.recentStandup.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {dept.standupTime && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Daily at {dept.standupTime} · {dept.standupDuration ?? 15} min
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">No standups yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Task summary strip */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Task Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {[
                  { label: 'Total Tasks', value: dept._count.tasks,      color: 'text-foreground', filter: 'all'         as TaskFilter },
                  { label: 'Overdue',     value: dash?.overdueCount ?? 0, color: 'text-red-600',    filter: 'overdue'    as TaskFilter },
                  { label: 'Blocked',     value: dash?.blockedCount ?? 0, color: 'text-orange-600', filter: 'blocked'    as TaskFilter },
                  { label: 'Due Today',   value: dash?.dueTodayCount ?? 0,color: 'text-blue-600',   filter: 'in_progress'as TaskFilter },
                ].map(({ label, value, color, filter }) => (
                  <button
                    key={label}
                    onClick={() => openTasksFiltered(filter)}
                    className="block p-4 rounded-lg bg-muted/40 hover:bg-muted/70 hover:shadow-sm transition-all"
                  >
                    <p className={cn('text-2xl font-bold', color)}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Projects Tab ── */}
        <TabsContent value="projects" className="mt-6">
          {selectedTeam ? (
            /* ── Drill-down: full project view ── */
            <ProjectFullView
              team={selectedTeam}
              canManage={canManage}
              deptId={dept.id}
              onBack={() => setSelectedTeam(null)}
              onUpdated={(updated) => { qc.invalidateQueries({ queryKey: ['teams'] }); setSelectedTeam(updated); }}
              onDelete={() => { deleteTeam.mutate(selectedTeam.id); }}
              isDeleting={deleteTeam.isPending}
              onViewMember={(memberId) => {
                const found = dept.users.find((u) => u.id === memberId);
                if (found) setMemberDialog(found);
              }}
            />
          ) : (
            /* ── Project list ── */
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold">Project Teams</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Click a project to open it</p>
                </div>
                {canManage && (
                  <Button size="sm" className="gap-2" onClick={() => setCreateTeamOpen(true)}>
                    <Plus className="h-4 w-4" /> New Project
                  </Button>
                )}
              </div>

              {deptTeams.length === 0 ? (
                <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
                  <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No projects yet</p>
                  <p className="text-xs mt-1">Create your first project to start tracking work</p>
                  {canManage && (
                    <Button size="sm" className="mt-4 gap-2" onClick={() => setCreateTeamOpen(true)}>
                      <Plus className="h-4 w-4" /> Create First Project
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {deptTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeam(team)}
                      className="text-left group"
                    >
                      <Card className="hover:shadow-md hover:border-primary/40 transition-all h-full">
                        <CardContent className="p-5">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 group-hover:bg-indigo-200 transition-colors">
                              <FolderKanban className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-sm truncate">{team.name}</p>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                              </div>
                              {team.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{team.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-3 flex-wrap">
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Users className="h-3 w-3" />
                                  {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                                </span>
                                {team.manager && (
                                  <span className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{team.manager.name}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Tasks Tab ── */}
        <TabsContent value="tasks" className="mt-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold">Department Tasks</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{filteredTasks.length} of {deptTasks.length} tasks shown</p>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {([
              { key: 'all',         label: 'All',         count: deptTasks.length },
              { key: 'overdue',     label: 'Overdue',     count: deptTasks.filter((t) => !!t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED').length },
              { key: 'blocked',     label: 'Blocked',     count: deptTasks.filter((t) => t.status === 'BLOCKED').length },
              { key: 'in_progress', label: 'In Progress', count: deptTasks.filter((t) => t.status === 'IN_PROGRESS').length },
              { key: 'in_review',   label: 'In Review',   count: deptTasks.filter((t) => t.status === 'IN_REVIEW').length },
              { key: 'todo',        label: 'To Do',       count: deptTasks.filter((t) => t.status === 'TODO').length },
              { key: 'done',        label: 'Done',        count: deptTasks.filter((t) => t.status === 'DONE').length },
            ] as Array<{ key: TaskFilter; label: string; count: number }>).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => { setTaskFilter(key); setDeptTasksPage(1); }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all',
                  taskFilter === key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                )}
              >
                {label}
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  taskFilter === key ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {tasksLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
              <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No tasks match this filter</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {paginate(filteredTasks, deptTasksPage).map((task) => {
                  const isOverdue = !!task.dueDate && new Date(task.dueDate) < now && task.status !== 'DONE' && task.status !== 'CANCELLED';
                  return (
                    <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer">
                      {/* Status dot */}
                      <div className={cn('h-2 w-2 rounded-full shrink-0', {
                        'bg-red-500':    task.status === 'BLOCKED',
                        'bg-blue-500':   task.status === 'IN_PROGRESS',
                        'bg-amber-400':  task.status === 'IN_REVIEW',
                        'bg-green-500':  task.status === 'DONE',
                        'bg-gray-300':   task.status === 'TODO',
                      })} />

                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium truncate', task.status === 'DONE' && 'line-through text-muted-foreground')}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {isOverdue && (
                            <span className="text-xs text-red-600 font-medium">⚠ Overdue</span>
                          )}
                          {task.dueDate && (
                            <span className={cn('text-xs', isOverdue ? 'text-red-500' : 'text-muted-foreground')}>
                              {formatDate(task.dueDate)}
                            </span>
                          )}
                          {task.assignee && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const found = dept.users.find((u) => u.id === task.assignee!.id);
                                if (found) setMemberDialog(found);
                              }}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={task.assignee.avatarUrl} />
                                <AvatarFallback className="text-[8px] bg-primary/10">{getInitials(task.assignee.name)}</AvatarFallback>
                              </Avatar>
                              {task.assignee.name}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn('text-xs border hidden sm:inline-flex', priorityColor(task.priority))}>
                          {task.priority}
                        </Badge>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', statusColor(task.status))}>
                          {STATUS_LABELS[task.status] ?? task.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pagination total={filteredTasks.length} page={deptTasksPage} onPageChange={setDeptTasksPage} />
            </>
          )}
        </TabsContent>

        {/* ── Members Tab ── */}
        <TabsContent value="members" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Team Members ({dept.users.length})</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click any member to see their work</p>
            </div>
          </div>

          {dept.users.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No members assigned yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {dept.users.map((member) => {
                const memberTasks = deptTasks.filter((t) => t.assignee?.id === member.id);
                const doneTasks   = memberTasks.filter((t) => t.status === 'DONE').length;
                const overdueCt   = memberTasks.filter((t) => !!t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED').length;
                const rate        = memberTasks.length > 0 ? Math.round((doneTasks / memberTasks.length) * 100) : 0;
                return (
                  <button
                    key={member.id}
                    onClick={() => setMemberDialog(member)}
                    className="text-left"
                  >
                    <Card className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={member.avatarUrl} />
                              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                              member.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{member.name}</p>
                            <div className="mt-0.5"><RoleBadge role={member.role} /></div>
                            {memberTasks.length > 0 && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <ProgressBar value={rate} className="flex-1 max-w-[80px]" />
                                <span className="text-xs text-muted-foreground">{doneTasks}/{memberTasks.length}</span>
                                {overdueCt > 0 && (
                                  <span className="text-xs text-red-500 font-medium">⚠{overdueCt}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}

          {/* Project membership breakdown */}
          {deptTeams.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Project Membership</h3>
              <div className="space-y-3">
                {deptTeams.map((team) => (
                  <div key={team.id} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-semibold">{team.name}</span>
                        {team.manager && (
                          <span className="text-xs text-muted-foreground">· {team.manager.name}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">{team.memberCount} members</Badge>
                    </div>
                    {team.members.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No members assigned</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {team.members.map((m) => {
                          const deptUser = dept.users.find((u) => u.id === m.user.id);
                          return (
                            <button
                              key={m.user.id}
                              onClick={() => deptUser && setMemberDialog(deptUser)}
                              className="flex items-center gap-1.5 rounded-lg border bg-muted/30 px-2.5 py-1.5 hover:bg-muted/60 hover:border-primary/40 transition-colors"
                            >
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[10px] bg-primary/10">{getInitials(m.user.name)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-medium">{m.user.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Member detail dialog ── */}
      {memberDialog && (
        <MemberDetailDialog
          member={memberDialog}
          tasks={deptTasks.filter((t) => t.assignee?.id === memberDialog.id)}
          onClose={() => setMemberDialog(null)}
        />
      )}

      {/* ── Task detail drawer ── */}
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      {/* Create project dialog */}
      {canManage && createTeamOpen && (
        <CreateTeamDialog
          deptId={dept.id}
          deptName={dept.name}
          deptUsers={dept.users}
          onClose={() => setCreateTeamOpen(false)}
          onSaved={(team) => {
            qc.invalidateQueries({ queryKey: ['teams'] });
            setSelectedTeam(team);
            setCreateTeamOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Member detail dialog ───────────────────────────────────────────────────────

function MemberDetailDialog({ member, tasks, onClose }: {
  member: DeptMember;
  tasks: DeptTask[];
  onClose: () => void;
}) {
  const now = new Date();
  const done       = tasks.filter((t) => t.status === 'DONE').length;
  const blocked    = tasks.filter((t) => t.status === 'BLOCKED').length;
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const overdue    = tasks.filter((t) => !!t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED').length;
  const rate       = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const [filter, setFilter] = useState<string>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const shown = tasks.filter((t) => {
    if (filter === 'all')      return true;
    if (filter === 'overdue')  return !!t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED';
    return t.status === filter;
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={member.avatarUrl} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">{getInitials(member.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{member.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <RoleBadge role={member.role} />
                <span className={cn('text-xs', member.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-400')}>
                  ● {member.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-2 my-2">
          {[
            { label: 'Total',       value: tasks.length, color: 'text-foreground' },
            { label: 'Done',        value: done,         color: 'text-green-600' },
            { label: 'Blocked',     value: blocked,      color: 'text-red-600' },
            { label: 'Overdue',     value: overdue,      color: 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-muted/40 p-2.5 text-center">
              <p className={cn('text-xl font-bold leading-none', color)}>{value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {tasks.length > 0 && (
          <div className="flex items-center gap-2 mb-1">
            <ProgressBar value={rate} className="flex-1" />
            <span className="text-xs text-muted-foreground shrink-0">{rate}% complete</span>
          </div>
        )}

        {/* Quick filter */}
        {tasks.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'IN_PROGRESS', 'BLOCKED', 'overdue', 'DONE', 'TODO'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn(
                  'text-xs rounded-full px-2.5 py-1 border transition-all',
                  filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                {f === 'all' ? 'All' : f === 'overdue' ? 'Overdue' : (STATUS_LABELS[f] ?? f)}
              </button>
            ))}
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 mt-2">
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No tasks assigned</div>
          ) : shown.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No tasks match this filter</div>
          ) : (
            shown.map((task) => {
              const isOverdue = !!task.dueDate && new Date(task.dueDate) < now && task.status !== 'DONE' && task.status !== 'CANCELLED';
              return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                  <div className={cn('h-2 w-2 rounded-full shrink-0', {
                    'bg-red-500': task.status === 'BLOCKED', 'bg-blue-500': task.status === 'IN_PROGRESS',
                    'bg-amber-400': task.status === 'IN_REVIEW', 'bg-green-500': task.status === 'DONE', 'bg-gray-300': task.status === 'TODO',
                  })} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm truncate', task.status === 'DONE' && 'line-through text-muted-foreground')}>
                      {task.title}
                    </p>
                    {task.dueDate && (
                      <p className={cn('text-xs mt-0.5', isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                        {isOverdue ? '⚠ Overdue · ' : ''}{formatDate(task.dueDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className={cn('text-xs border', priorityColor(task.priority))}>{task.priority}</Badge>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', statusColor(task.status))}>
                      {STATUS_LABELS[task.status] ?? task.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </Dialog>
  );
}

// ── Project Full View (drill-down, with own tabs) ─────────────────────────────

type ProjectTab = 'overview' | 'members' | 'tasks' | 'documents';

function ProjectFullView({ team, canManage, deptId, onBack, onUpdated, onDelete, isDeleting, onViewMember, hideBack }: {
  team: Team; canManage: boolean; deptId: string;
  onBack: () => void; hideBack?: boolean;
  onUpdated: (t: Team) => void; onDelete: () => void; isDeleting: boolean;
  onViewMember: (memberId: string) => void;
}) {
  const qc = useQueryClient();
  const [tab,            setTab]           = useState<ProjectTab>('overview');
  const [editOpen,       setEditOpen]      = useState(false);
  const [addMemberOpen,  setAddMemberOpen] = useState(false);
  const [addTaskOpen,    setAddTaskOpen]   = useState(false);
  const [confirmDelete,  setConfirmDelete] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [taskFilter,     setTaskFilter]    = useState<string>('all');
  const [tasksPage,      setTasksPage]     = useState(1);
  const [membersPage,    setMembersPage]   = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [search,         setSearch]        = useState('');
  const now = new Date();

  const { user: authUser } = useAuthStore();
  const canDelete        = ['OWNER', 'DEPARTMENT_HEAD'].includes(authUser?.role || '');
  const canAssignManager = ['OWNER', 'DEPARTMENT_HEAD'].includes(authUser?.role || '');
  const isProjectManager = authUser?.id === team.managerUserId;
  const canAddMember     = canManage || isProjectManager;
  const canCreateTask    = canManage || authUser?.role === 'TEAM_MEMBER';
  const canAssignTask    = canManage || isProjectManager;

  const { data: overview, isLoading } = useQuery<ProjectOverview>({
    queryKey: ['team-overview', team.id],
    queryFn:  () => api.get(`/teams/${team.id}/overview`).then((r) => r.data),
    refetchOnWindowFocus: false,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/teams/${team.id}/members/${userId}`).then((r) => r.data),
    onSuccess:  (updated: Team) => {
      onUpdated(updated);
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team-overview', team.id] });
    },
  });

  const assignManager = useMutation({
    mutationFn: (userId: string) => api.patch(`/teams/${team.id}`, { managerUserId: userId }).then((r) => r.data),
    onSuccess: (updated: Team) => {
      onUpdated(updated);
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team-overview', team.id] });
    },
  });

  const stats = overview?.stats;

  // Regular team members (not manager, not elevated role) see only their own tasks
  const isRegularMember = authUser?.role === 'TEAM_MEMBER' && !isProjectManager;
  // Flatten all member tasks for the Tasks tab
  const allProjectTasks = (overview?.memberStats ?? [])
    .filter((ms) => !isRegularMember || ms.user.id === authUser?.id)
    .flatMap((ms) =>
      ms.tasks.map((t) => ({ ...t, memberName: ms.user.name, memberAvatar: ms.user.avatarUrl, memberId: ms.user.id }))
    );
  const q = search.trim().toLowerCase();
  const filteredProjectTasks = allProjectTasks.filter((t) => {
    const matchesSearch = !q || t.title.toLowerCase().includes(q) || t.memberName.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (taskFilter === 'all')     return true;
    if (taskFilter === 'overdue') return !!t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED';
    return t.status === taskFilter;
  });
  const filteredMembers = (overview?.memberStats ?? []).filter((ms) =>
    !q || ms.user.name.toLowerCase().includes(q) || ms.tasks.some((t) => t.title.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-5">
      {/* Back + header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {!hideBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 shrink-0">
              <FolderKanban className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{team.name}</h2>
              {team.description && <p className="text-sm text-muted-foreground">{team.description}</p>}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="destructive" onClick={onDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Manager / Dept Head chips */}
      {(team.manager || team.departmentHead) && (
        <div className="flex gap-3 flex-wrap">
          {[
            { person: team.manager,       label: 'Manager',   bg: 'bg-teal-100 text-teal-700' },
            { person: team.departmentHead, label: 'Dept Head', bg: 'bg-blue-100 text-blue-700' },
          ].filter((c) => c.person).map(({ person, label, bg }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
              <Avatar className="h-6 w-6">
                <AvatarImage src={person!.avatarUrl} />
                <AvatarFallback className={cn('text-[10px]', bg)}>{getInitials(person!.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-medium leading-none">{person!.name}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as ProjectTab); setSearch(''); setTasksPage(1); setMembersPage(1); }}>
        <div className="flex items-center gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">
            Members
            {team.memberCount > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5">
                {team.memberCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks
            {allProjectTasks.length > 0 && (
              <span className="ml-1.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5">
                {allProjectTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-3.5 w-3.5 mr-1" /> Docs
          </TabsTrigger>
          </TabsList>

          {/* Search — shown on Members and Tasks tabs only */}
          {(tab === 'members' || tab === 'tasks') && (
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setTasksPage(1); setMembersPage(1); }}
                placeholder={tab === 'members' ? 'Search member or task…' : 'Search task or member…'}
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="mt-5 space-y-4">
          {isLoading ? (
            <div className="h-40 rounded-xl bg-muted animate-pulse" />
          ) : stats ? (
            <>
              {/* Progress card */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-primary" /> Project Progress
                    </span>
                    <span className="text-2xl font-bold text-primary">{stats.completionRate}%</span>
                  </div>
                  <ProgressBar value={stats.completionRate} className="mb-5" />

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total',       value: stats.total,                       icon: ClipboardList, color: 'text-gray-600 bg-gray-100' },
                      { label: 'Completed',   value: stats.done,                        icon: CheckSquare,   color: 'text-green-600 bg-green-50' },
                      { label: 'In Progress', value: stats.inProgress + stats.inReview, icon: Clock,         color: 'text-blue-600 bg-blue-50' },
                      { label: 'Overdue',     value: stats.overdue,                     icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <button
                        key={label}
                        onClick={() => {
                          setTaskFilter(label === 'Overdue' ? 'overdue' : label === 'Completed' ? 'DONE' : label === 'In Progress' ? 'IN_PROGRESS' : 'all');
                          setTab('tasks');
                        }}
                        className={cn('rounded-lg px-3 py-2.5 flex items-center gap-2.5 hover:opacity-80 transition-opacity', color.split(' ')[1])}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', color.split(' ')[0])} />
                        <div className="text-left">
                          <p className={cn('text-xl font-bold leading-none', color.split(' ')[0])}>{value}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {stats.total > 0 && (
                    <div className="mt-5">
                      <p className="text-xs text-muted-foreground mb-2">Status breakdown</p>
                      <div className="flex rounded-full overflow-hidden h-3 gap-0.5">
                        {[
                          { val: stats.done,       color: 'bg-green-500' },
                          { val: stats.inProgress, color: 'bg-blue-500' },
                          { val: stats.inReview,   color: 'bg-amber-400' },
                          { val: stats.blocked,    color: 'bg-red-500' },
                          { val: stats.todo,       color: 'bg-gray-300' },
                        ].filter((s) => s.val > 0).map((s, i) => (
                          <div key={i} className={cn('h-full rounded-sm', s.color)}
                            style={{ width: `${Math.round((s.val / stats.total) * 100)}%` }} />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        {[
                          { label: 'Done',        val: stats.done,       color: 'bg-green-500' },
                          { label: 'In Progress', val: stats.inProgress, color: 'bg-blue-500' },
                          { label: 'In Review',   val: stats.inReview,   color: 'bg-amber-400' },
                          { label: 'Blocked',     val: stats.blocked,    color: 'bg-red-500' },
                          { label: 'To Do',       val: stats.todo,       color: 'bg-gray-300' },
                        ].filter((s) => s.val > 0).map((s) => (
                          <span key={s.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className={cn('inline-block h-2 w-2 rounded-full', s.color)} />
                            {s.label} ({s.val})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">No data yet</div>
          )}
        </TabsContent>

        {/* ── Members tab ── */}
        <TabsContent value="members" className="mt-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold">Members ({team.memberCount})</p>
            {canAddMember && (
              <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setAddMemberOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Add Member
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
          ) : (overview?.memberStats ?? []).length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-dashed text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No members yet — add members to track work</p>
              {canAddMember && (
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => setAddMemberOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Add Member
                </Button>
              )}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-dashed text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No members match "{search}"</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginate(filteredMembers, membersPage, 8).map((ms) => (
                  <MemberTaskRow
                    key={ms.user.id}
                    ms={ms}
                    expanded={expandedMember === ms.user.id}
                    onToggle={() => setExpandedMember(expandedMember === ms.user.id ? null : ms.user.id)}
                    onRemove={() => removeMember.mutate(ms.user.id)}
                    removing={removeMember.isPending}
                    canManage={canAddMember}
                    isManager={team.manager?.id === ms.user.id}
                    canAssignManager={canAssignManager}
                    onAssignManager={() => assignManager.mutate(ms.user.id)}
                    onViewMember={onViewMember}
                    onTaskClick={(id) => setSelectedTaskId(id)}
                  />
                ))}
              </div>
              <Pagination total={filteredMembers.length} page={membersPage} onPageChange={setMembersPage} pageSize={8} />
            </>
          )}
        </TabsContent>

        {/* ── Tasks tab ── */}
        <TabsContent value="tasks" className="mt-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {([
              { key: 'all',         label: 'All',         count: allProjectTasks.length },
              { key: 'overdue',     label: 'Overdue',     count: allProjectTasks.filter((t) => !!t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED').length },
              { key: 'BLOCKED',     label: 'Blocked',     count: allProjectTasks.filter((t) => t.status === 'BLOCKED').length },
              { key: 'IN_PROGRESS', label: 'In Progress', count: allProjectTasks.filter((t) => t.status === 'IN_PROGRESS').length },
              { key: 'IN_REVIEW',   label: 'In Review',   count: allProjectTasks.filter((t) => t.status === 'IN_REVIEW').length },
              { key: 'TODO',        label: 'To Do',       count: allProjectTasks.filter((t) => t.status === 'TODO').length },
              { key: 'DONE',        label: 'Done',        count: allProjectTasks.filter((t) => t.status === 'DONE').length },
            ] as Array<{ key: string; label: string; count: number }>).map(({ key, label, count }) => (
              <button key={key} onClick={() => { setTaskFilter(key); setTasksPage(1); }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all',
                  taskFilter === key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                )}
              >
                {label}
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  taskFilter === key ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {count}
                </span>
              </button>
            ))}
            </div>
            {canCreateTask && (
              <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={() => setAddTaskOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New Task
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
          ) : filteredProjectTasks.length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-dashed text-muted-foreground">
              <CheckSquare className="h-7 w-7 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{q ? `No tasks match "${search}"` : 'No tasks match this filter'}</p>
            </div>
          ) : (
            <>
            <div className="space-y-2">
              {paginate(filteredProjectTasks, tasksPage).map((task) => {
                const isOverdue = !!task.dueDate && new Date(task.dueDate) < now && task.status !== 'DONE' && task.status !== 'CANCELLED';
                return (
                  <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className={cn('h-2 w-2 rounded-full shrink-0', {
                      'bg-red-500': task.status === 'BLOCKED', 'bg-blue-500': task.status === 'IN_PROGRESS',
                      'bg-amber-400': task.status === 'IN_REVIEW', 'bg-green-500': task.status === 'DONE', 'bg-gray-300': task.status === 'TODO',
                    })} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', task.status === 'DONE' && 'line-through text-muted-foreground')}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {isOverdue && <span className="text-xs text-red-600 font-medium">⚠ Overdue</span>}
                        {task.dueDate && (
                          <span className={cn('text-xs', isOverdue ? 'text-red-500' : 'text-muted-foreground')}>
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewMember(task.memberId); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={task.memberAvatar} />
                            <AvatarFallback className="text-[8px] bg-primary/10">{getInitials(task.memberName)}</AvatarFallback>
                          </Avatar>
                          {task.memberName}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={cn('text-xs border hidden sm:inline-flex', priorityColor(task.priority))}>
                        {task.priority}
                      </Badge>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', statusColor(task.status))}>
                        {STATUS_LABELS[task.status] ?? task.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination total={filteredProjectTasks.length} page={tasksPage} onPageChange={setTasksPage} />
            </>
          )}
        </TabsContent>

        {/* ── Documents tab ── */}
        <TabsContent value="documents" className="mt-5">
          <ProjectDocuments teamId={team.id} orgId={team.department.id} canDelete={canDelete} />
        </TabsContent>
      </Tabs>

      {editOpen && (
        <EditTeamDialog
          team={team} deptId={deptId}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { onUpdated(updated); setEditOpen(false); qc.invalidateQueries({ queryKey: ['team-overview', team.id] }); }}
        />
      )}
      {addMemberOpen && (
        <AddMemberToTeamDialog
          team={team}
          onClose={() => setAddMemberOpen(false)}
          onAdded={(updated) => { onUpdated(updated); qc.invalidateQueries({ queryKey: ['team-overview', team.id] }); setAddMemberOpen(false); }}
        />
      )}
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      {addTaskOpen && (
        <AddProjectTaskDialog
          teamId={team.id}
          canAssign={canAssignTask}
          selfId={authUser?.id ?? ''}
          members={(() => {
            const seen = new Set<string>();
            const list: TeamUser[] = [];
            for (const ms of overview?.memberStats ?? []) {
              if (!seen.has(ms.user.id)) { seen.add(ms.user.id); list.push(ms.user); }
            }
            for (const extra of [team.manager, team.departmentHead]) {
              if (extra && !seen.has(extra.id)) { seen.add(extra.id); list.push(extra); }
            }
            return list;
          })()}
          onClose={() => setAddTaskOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['team-overview', team.id] });
            qc.invalidateQueries({ queryKey: ['tasks'] });
            setAddTaskOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Member task row ────────────────────────────────────────────────────────────

function MemberTaskRow({ ms, expanded, onToggle, onRemove, removing, canManage, isManager, canAssignManager, onAssignManager, onViewMember, onTaskClick }: {
  ms: MemberStat; expanded: boolean; onToggle: () => void;
  onRemove: () => void; removing: boolean; canManage: boolean;
  isManager?: boolean; canAssignManager?: boolean; onAssignManager?: () => void;
  onViewMember: (id: string) => void;
  onTaskClick?: (id: string) => void;
}) {
  const now = new Date();
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={ms.user.avatarUrl} />
          <AvatarFallback className="text-xs bg-primary/10">{getInitials(ms.user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => onViewMember(ms.user.id)} className="text-sm font-medium hover:underline text-left">
              {ms.user.name}
            </button>
            <RoleBadge role={ms.user.role} />
            {isManager && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Manager
              </span>
            )}
            {ms.stats.overdue > 0 && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-0.5">
                <AlertTriangle className="h-3 w-3" /> {ms.stats.overdue} overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ProgressBar value={ms.stats.completionRate} className="flex-1 max-w-[120px]" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {ms.stats.done}/{ms.stats.total} · {ms.stats.completionRate}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ms.stats.total > 0 && (
            <button onClick={onToggle}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {ms.stats.total} task{ms.stats.total !== 1 ? 's' : ''}
            </button>
          )}
          {canAssignManager && !isManager && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-500"
              onClick={onAssignManager} title="Assign as project manager">
              <Star className="h-3.5 w-3.5" />
            </Button>
          )}
          {canManage && (
            confirmRemove ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
                  onClick={() => { onRemove(); setConfirmRemove(false); }} disabled={removing}>
                  {removing ? '…' : 'Remove'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                  onClick={() => setConfirmRemove(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmRemove(true)} title="Remove from project">
                <UserMinus className="h-3.5 w-3.5" />
              </Button>
            )
          )}
        </div>
      </div>

      <div className="flex border-t divide-x text-center">
        {[
          { label: 'To Do',       val: ms.stats.todo,       color: 'text-gray-600' },
          { label: 'In Progress', val: ms.stats.inProgress, color: 'text-blue-600' },
          { label: 'In Review',   val: ms.stats.inReview,   color: 'text-amber-600' },
          { label: 'Blocked',     val: ms.stats.blocked,    color: 'text-red-600' },
          { label: 'Done',        val: ms.stats.done,       color: 'text-green-600' },
        ].map((s) => (
          <div key={s.label} className="flex-1 py-1.5">
            <p className={cn('text-sm font-semibold', s.color)}>{s.val}</p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {expanded && ms.tasks.length > 0 && (
        <div className="border-t divide-y bg-background">
          {ms.tasks.map((t) => {
            const overdue = t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED';
            return (
              <div key={t.id} onClick={() => onTaskClick?.(t.id)} className={cn('flex items-center gap-3 px-3 py-2 transition-colors', onTaskClick && 'cursor-pointer hover:bg-muted/40')}>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm truncate', t.status === 'DONE' && 'line-through text-muted-foreground')}>{t.title}</p>
                  {t.dueDate && (
                    <p className={cn('text-xs mt-0.5', overdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                      {overdue ? '⚠ Overdue · ' : ''}{formatDate(t.dueDate)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn('text-xs border', priorityColor(t.priority))}>{t.priority}</Badge>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', statusColor(t.status))}>
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Create Team Dialog ─────────────────────────────────────────────────────────

const createTeamSchema = z.object({
  name:                 z.string().min(2, 'Name required'),
  slug:                 z.string().min(2).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  description:          z.string().optional(),
  managerUserId:        z.string().optional(),
  departmentHeadUserId: z.string().optional(),
});
type CreateTeamForm = z.infer<typeof createTeamSchema>;

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function CreateTeamDialog({ deptId, deptName, deptUsers, onClose, onSaved }: {
  deptId: string; deptName: string; deptUsers: DeptMember[];
  onClose: () => void; onSaved: (t: Team) => void;
}) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<CreateTeamForm>({
    resolver: zodResolver(createTeamSchema),
  });
  const managers  = deptUsers.filter((u) => ['MANAGER', 'DEPARTMENT_HEAD', 'COMPANY_ADMIN'].includes(u.role));
  const deptHeads = deptUsers.filter((u) => ['DEPARTMENT_HEAD', 'OWNER', 'COMPANY_ADMIN'].includes(u.role));

  const onSubmit = async (data: CreateTeamForm) => {
    const result: Team = await api.post('/teams', {
      ...data, departmentId: deptId,
      managerUserId:        data.managerUserId        || undefined,
      departmentHeadUserId: data.departmentHeadUserId || undefined,
    }).then((r) => r.data);
    reset(); onSaved(result);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-indigo-500" />
            New Project — {deptName}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Project Name *</Label>
            <Input placeholder="e.g. Mobile App Redesign"
              {...register('name')}
              onChange={(e) => { register('name').onChange(e); setValue('slug', slugify(e.target.value)); }}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Slug *</Label>
            <Input placeholder="mobile-app-redesign" {...register('slug')} />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="What is this project about?" rows={2} {...register('description')} />
          </div>
          <div className="space-y-1.5">
            <Label>Project Manager</Label>
            <Select value={watch('managerUserId') || ''} onValueChange={(v) => setValue('managerUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Assign a manager (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {managers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department Head</Label>
            <Select value={watch('departmentHeadUserId') || ''} onValueChange={(v) => setValue('departmentHeadUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Assign dept head (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {deptHeads.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create Project'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Team Dialog ───────────────────────────────────────────────────────────

const editTeamSchema = z.object({
  name:                 z.string().min(2, 'Name required'),
  description:          z.string().optional(),
  managerUserId:        z.string().optional(),
  departmentHeadUserId: z.string().optional(),
});
type EditTeamForm = z.infer<typeof editTeamSchema>;

function EditTeamDialog({ team, deptId, onClose, onSaved }: {
  team: Team; deptId: string; onClose: () => void; onSaved: (t: Team) => void;
}) {
  const { data: allUsers = [] } = useQuery<OrgUser[]>({
    queryKey: ['users-list'],
    queryFn:  () => api.get('/users').then((r) => r.data),
  });
  const deptMembers = allUsers.filter((u) => u.departmentId === deptId && u.role !== 'OWNER');
  const managers    = deptMembers.filter((u) => ['MANAGER', 'DEPARTMENT_HEAD', 'COMPANY_ADMIN'].includes(u.role));
  const deptHeads   = allUsers.filter((u)   => ['DEPARTMENT_HEAD', 'OWNER', 'COMPANY_ADMIN'].includes(u.role));

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<EditTeamForm>({
    resolver: zodResolver(editTeamSchema),
    defaultValues: {
      name:                 team.name,
      description:          team.description ?? '',
      managerUserId:        team.manager?.id ?? '',
      departmentHeadUserId: team.departmentHead?.id ?? '',
    },
  });

  const onSubmit = async (data: EditTeamForm) => {
    const result: Team = await api.patch(`/teams/${team.id}`, {
      ...data,
      managerUserId:        data.managerUserId        || undefined,
      departmentHeadUserId: data.departmentHeadUserId || undefined,
    }).then((r) => r.data);
    reset(); onSaved(result);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Project — {team.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project Name *</Label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} {...register('description')} />
          </div>
          <div className="space-y-1.5">
            <Label>Project Manager</Label>
            <Select value={watch('managerUserId') || ''} onValueChange={(v) => setValue('managerUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {managers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department Head</Label>
            <Select value={watch('departmentHeadUserId') || ''} onValueChange={(v) => setValue('departmentHeadUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {deptHeads.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add member to team ─────────────────────────────────────────────────────────

function AddMemberToTeamDialog({ team, onClose, onAdded }: {
  team: Team; onClose: () => void; onAdded: (t: Team) => void;
}) {
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [managerUserId, setManagerUserId] = useState('');
  const [search,        setSearch]        = useState('');
  const [adding,        setAdding]        = useState(false);
  const [error,         setError]         = useState('');

  const { data: allUsers = [], isLoading } = useQuery<OrgUser[]>({
    queryKey: ['users-list'],
    queryFn:  () => api.get('/users').then((r) => r.data),
  });

  const existingIds = new Set(team.members.map((m) => m.user.id));
  const eligible    = allUsers.filter((u) =>
    !existingIds.has(u.id) &&
    u.role !== 'OWNER' &&
    (!u.departmentId || u.departmentId === team.department.id)
  );

  const q       = search.trim().toLowerCase();
  const visible = q
    ? eligible.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : eligible;

  const selectedUsers = eligible.filter((u) => selectedIds.has(u.id));

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    setError('');
    try {
      let lastResult: Team | null = null;
      for (const userId of selectedIds) {
        lastResult = await api.post(`/teams/${team.id}/members`, { userId }).then((r) => r.data);
      }
      if (managerUserId) {
        lastResult = await api.patch(`/teams/${team.id}`, { managerUserId }).then((r) => r.data);
      }
      if (lastResult) onAdded(lastResult);
      setSelectedIds(new Set());
      setSearch('');
      setManagerUserId('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? 'Failed to add members');
    } finally {
      setAdding(false);
    }
  };

  const ROLE_LABEL: Record<string, string> = {
    COMPANY_ADMIN: 'Admin', DEPARTMENT_HEAD: 'Dept Head',
    MANAGER: 'Manager', TEAM_MEMBER: 'Member', COACH_ADVISOR: 'Advisor',
  };

  const reset = () => { setSelectedIds(new Set()); setSearch(''); setError(''); setManagerUserId(''); onClose(); };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) reset(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add Members — {team.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-8 h-9"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* User list */}
          <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : eligible.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Everyone is already a member</div>
            ) : visible.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No one found matching "{search}"</div>
            ) : (
              visible.map((u) => {
                const selected = selectedIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      selected ? 'bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    {/* Checkbox */}
                    <div className={cn(
                      'h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                      selected ? 'bg-primary border-primary' : 'border-border'
                    )}>
                      {selected && (
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={u.avatarUrl} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(u.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {u.role && (
                      <span className="text-[10px] rounded-full px-2 py-0.5 bg-muted text-muted-foreground font-medium shrink-0">
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Selected chips tray */}
          {selectedUsers.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
              <p className="text-xs text-muted-foreground mb-2 font-medium">
                {selectedUsers.length} person{selectedUsers.length > 1 ? 's' : ''} selected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedUsers.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1 font-medium">
                    {u.name}
                    <button onClick={() => { toggle(u.id); if (managerUserId === u.id) setManagerUserId(''); }} className="hover:text-primary/60 transition-colors ml-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assign project manager — optional, only when members are selected */}
          {selectedUsers.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Star className="h-3 w-3 text-amber-500" />
                Assign as Project Manager
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select
                value={managerUserId || '__none__'}
                onValueChange={(v) => setManagerUserId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No manager assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No manager assignment</SelectItem>
                  {selectedUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <Button variant="outline" onClick={reset}>Cancel</Button>
          <Button disabled={selectedIds.size === 0 || adding} onClick={handleAdd}>
            {adding
              ? 'Adding…'
              : selectedIds.size > 1
                ? `Add ${selectedIds.size} Members`
                : 'Add Member'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Project Task Dialog ───────────────────────────────────────────────────

const addProjectTaskSchema = z.object({
  title:           z.string().min(2, 'Title required'),
  description:     z.string().optional(),
  expectedOutcome: z.string().optional(),
  assigneeUserId:  z.string().min(1, 'Assignee required'),
  priority:        z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  dueDate:         z.string().optional(),
  dueTime:         z.string().optional(),
});
type AddProjectTaskForm = z.infer<typeof addProjectTaskSchema>;

function AddProjectTaskDialog({ teamId, members, canAssign, selfId, onClose, onCreated }: {
  teamId: string;
  members: TeamUser[];
  canAssign: boolean;
  selfId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<AddProjectTaskForm>({
    resolver: zodResolver(addProjectTaskSchema),
    defaultValues: { priority: 'MEDIUM', assigneeUserId: canAssign ? '' : selfId },
  });

  const priority = watch('priority') ?? 'MEDIUM';
  const assigneeId = watch('assigneeUserId') ?? '';

  const onSubmit = async (data: AddProjectTaskForm) => {
    await api.post(`/teams/${teamId}/tasks`, {
      title:           data.title,
      description:     data.description || undefined,
      priority:        data.priority,
      dueDate:         data.dueDate || undefined,
      assignToUserId:  canAssign ? data.assigneeUserId : selfId,
    });
    onCreated();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-500" /> New Task for Project
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="What needs to be done?" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="Additional context…" rows={2} {...register('description')} />
          </div>

          {/* Expected Outcome */}
          <div className="space-y-1.5">
            <Label>Expected Outcome</Label>
            <Input placeholder="What does done look like?" {...register('expectedOutcome')} />
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <Label>Assign To *</Label>
            {!canAssign ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {getInitials(members.find(m => m.id === selfId)?.name ?? 'Me')}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{members.find(m => m.id === selfId)?.name ?? 'Me'}</span>
                <span className="text-xs text-muted-foreground ml-auto">(assigned to you)</span>
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-lg border px-3 py-2.5">
                No members in this project yet — add members first.
              </p>
            ) : (
              <Select value={assigneeId} onValueChange={(v) => setValue('assigneeUserId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {canAssign && errors.assigneeUserId && (
              <p className="text-xs text-destructive">{errors.assigneeUserId.message}</p>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setValue('priority', v as AddProjectTaskForm['priority'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due date + time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" {...register('dueDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Due Time</Label>
              <Input type="time" {...register('dueTime')} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || members.length === 0}>
              {isSubmitting ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Project Documents ─────────────────────────────────────────────────────────

function ProjectDocuments({ teamId, canDelete }: { teamId: string; orgId: string; canDelete: boolean }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDocId, setConfirmDocId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery<TeamDoc[]>({
    queryKey: ['team-docs', teamId],
    queryFn:  () => api.get(`/teams/${teamId}/documents`).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/teams/${teamId}/documents/${docId}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['team-docs', teamId] }),
  });

  const getFileIcon = (fileType?: string, url?: string) => {
    const t = (fileType ?? url ?? '').toLowerCase();
    if (t.includes('pdf'))                         return '📄';
    if (t.includes('doc'))                         return '📝';
    if (t.includes('xls') || t.includes('sheet'))  return '📊';
    if (t.includes('ppt') || t.includes('slide'))  return '📋';
    if (t.match(/jpg|jpeg|png|gif|webp/))           return '🖼';
    if (t.match(/mp4|webm|mov/))                   return '🎬';
    return '🔗';
  };

  const fmtSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold">Reference Documents</p>
          <p className="text-xs text-muted-foreground mt-0.5">Files and links for project understanding — anyone can add</p>
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Document
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium">No documents yet</p>
          <p className="text-xs mt-1">Add files, links, or specs for the team to reference</p>
          <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add First Document
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-card hover:bg-muted/20 transition-colors group">
              <span className="text-xl shrink-0">{getFileIcon(doc.fileType, doc.url)}</span>
              <div className="flex-1 min-w-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {doc.name}
                </a>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Added by {doc.uploadedBy.name}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{formatRelative(doc.createdAt)}</span>
                  {doc.size && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{fmtSize(doc.size)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Open"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </a>
                {canDelete && (
                  <button
                    onClick={() => setConfirmDocId(doc.id)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddDocumentDialog
          teamId={teamId}
          onClose={() => setAddOpen(false)}
          onAdded={() => { qc.invalidateQueries({ queryKey: ['team-docs', teamId] }); setAddOpen(false); }}
        />
      )}

      <Dialog open={!!confirmDocId} onOpenChange={(v) => !v && setConfirmDocId(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDocId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirmDocId) {
                  deleteMutation.mutate(confirmDocId, { onSuccess: () => setConfirmDocId(null) });
                }
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddDocumentDialog({ teamId, onClose, onAdded }: {
  teamId: string; onClose: () => void; onAdded: () => void;
}) {
  const [mode,       setMode]       = useState<'file' | 'link'>('file');
  const [name,       setName]       = useState('');
  const [url,        setUrl]        = useState('');
  const [file,       setFile]       = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }

    setUploading(true);
    try {
      let finalUrl = url.trim();
      let fileType: string | undefined;
      let size: number | undefined;

      if (mode === 'file') {
        if (!file) { setError('Please select a file'); setUploading(false); return; }
        const form = new FormData();
        form.append('file', file);
        // Use fetch directly so the browser sets Content-Type: multipart/form-data
        // with the correct boundary — the axios instance default (application/json)
        // would otherwise prevent multer from parsing req.file.
        const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || '/api';
        const token = localStorage.getItem('gr_token');
        const uploadRes = await fetch(`${apiBase}/upload/content`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
          body: form,
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || 'Upload failed');
        }
        const data = await uploadRes.json() as { url: string; mimeType: string; size: number };
        finalUrl  = data.url;
        fileType  = data.mimeType;
        size      = data.size;
      } else {
        if (!finalUrl) { setError('URL is required'); setUploading(false); return; }
        if (!/^https?:\/\//i.test(finalUrl)) { setError('Enter a valid URL starting with http:// or https://'); setUploading(false); return; }
      }

      await api.post(`/teams/${teamId}/documents`, { name: name.trim(), url: finalUrl, fileType, size });
      onAdded();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" /> Add Reference Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg border p-1 gap-1">
            <button
              onClick={() => { setMode('file'); setUrl(''); }}
              className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors', mode === 'file' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Upload className="h-3.5 w-3.5" /> Upload File
            </button>
            <button
              onClick={() => { setMode('link'); setFile(null); }}
              className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors', mode === 'link' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Link2 className="h-3.5 w-3.5" /> Paste Link
            </button>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label>Document Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product Requirements Doc" />
          </div>

          {/* File or URL */}
          {mode === 'file' ? (
            <div className="space-y-1.5">
              <Label>File *</Label>
              <label className={cn(
                'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors',
                file ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/30'
              )}>
                <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov" onChange={handleFile} />
                {file ? (
                  <>
                    <span className="text-2xl mb-1">📄</span>
                    <p className="text-sm font-medium text-center">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground text-center">Click to browse or drag a file here</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, images, video — up to 50 MB</p>
                  </>
                )}
              </label>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>URL *</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/…"
                type="url"
              />
              <p className="text-xs text-muted-foreground">Notion pages, Google Docs, Figma links, GitHub repos — anything with a URL</p>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Add Document'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pagination helpers ────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function paginate<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  return items.slice((page - 1) * size, page * size);
}

function Pagination({ total, page, onPageChange, pageSize = PAGE_SIZE }: {
  total: number; page: number; onPageChange: (p: number) => void; pageSize?: number;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  const pages: (number | 'gap')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3)              pages.push('gap');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('gap');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t gap-4">
      <p className="text-xs text-muted-foreground shrink-0">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pages.map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={cn(
                'inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-md border text-xs font-medium transition-colors',
                page === p
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:bg-muted border-border'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
