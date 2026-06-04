import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CheckSquare, AlertTriangle, Zap, TrendingUp, Users, Clock, Target, BookOpen, Calendar, X, ChevronRight, Building2, CheckCircle2, Lock, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/store/authStore';
import { cn, kraStatusColor, formatDate } from '@/lib/utils';
import api from '@/api/client';

function StatCard({ title, value, icon: Icon, color, bg, subtitle, href }: {
  title: string; value: string | number; icon: React.ElementType;
  color: string; bg: string; subtitle?: string; href?: string;
}) {
  const inner = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className={cn('p-2.5 rounded-lg', bg)}>
          <Icon className={cn('h-5 w-5', color)} />
        </div>
      </div>
    </CardContent>
  );
  if (href) {
    return (
      <Link to={href}>
        <Card className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">{inner}</Card>
      </Link>
    );
  }
  return <Card>{inner}</Card>;
}

function departmentNameFromSlug(slug?: string) {
  if (!slug) return '';
  const parts = slug.split('-').filter(Boolean);
  const cleanedParts =
    parts.length > 1 && /[0-9]/.test(parts[parts.length - 1])
      ? parts.slice(0, -1)
      : parts;
  return cleanedParts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type Task = { id: string; title: string; status: string; priority: string; dueDate?: string; blockerType?: string; kra?: { name: string }; assignee?: { id: string; name: string } };

function TaskList({ tasks, isOverdue, isDueToday, showAssignee, onTaskClick }: {
  tasks: Task[];
  isOverdue: (t: Task) => boolean;
  isDueToday: (t: Task) => boolean;
  showAssignee: boolean;
  onTaskClick: (taskId: string) => void;
}) {
  const sorted = [...tasks]
    .sort((a, b) => {
      const aRank = isOverdue(a) ? 0 : isDueToday(a) ? 1 : a.dueDate ? 2 : 3;
      const bRank = isOverdue(b) ? 0 : isDueToday(b) ? 1 : b.dueDate ? 2 : 3;
      if (aRank !== bRank) return aRank - bRank;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    })
    .slice(0, 8);

  return (
    <div className="space-y-2">
      {sorted.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={() => onTaskClick(task.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onTaskClick(task.id);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className={cn('h-2 w-2 rounded-full shrink-0', {
            'bg-red-500': task.status === 'BLOCKED',
            'bg-blue-500': task.status === 'IN_PROGRESS',
            'bg-gray-300': task.status === 'TODO',
          })} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{task.title}</p>
            {showAssignee && task.assignee && (
              <Link
                to={`/team/${task.assignee.id}/report`}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="text-xs text-primary hover:underline truncate inline-block"
              >
                {task.assignee.name}
              </Link>
            )}
            {task.kra && !showAssignee && (
              <p className="text-xs text-muted-foreground truncate">KRA: {task.kra.name}</p>
            )}
          </div>
          {isOverdue(task) && (
            <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">Overdue</span>
          )}
          {isDueToday(task) && !isOverdue(task) && (
            <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200">Today</span>
          )}
          {!isOverdue(task) && !isDueToday(task) && task.dueDate && (
            <span className="shrink-0 text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>
          )}
          <Badge className={cn('shrink-0 text-xs border hidden sm:flex', {
            'bg-red-50 text-red-700 border-red-200': task.priority === 'CRITICAL',
            'bg-orange-50 text-orange-700 border-orange-200': task.priority === 'HIGH',
            'bg-yellow-50 text-yellow-700 border-yellow-200': task.priority === 'MEDIUM',
            'bg-gray-50 text-gray-600 border-gray-200': task.priority === 'LOW',
          })}>{task.priority}</Badge>
        </div>
      ))}
      {tasks.length > 8 && (
        <Link to="/tasks" className="block text-center text-xs text-primary hover:underline pt-1">
          View all {tasks.length} tasks →
        </Link>
      )}
    </div>
  );
}

// ── Setup Guide ──────────────────────────────────────────────────────────────

type SetupStep = {
  num: number;
  title: string;
  desc: string;
  href: string;
  doneKey: string;
};

const CEO_STEPS: SetupStep[] = [
  { num: 1, title: 'Create your first Department', desc: 'Departments organise your company into functional teams (e.g. Engineering, Sales).', href: '/departments', doneKey: 'hasDepts' },
  { num: 2, title: 'Invite Team Members', desc: 'Add people to your org and assign them to departments.', href: '/team', doneKey: 'hasMembers' },
  { num: 3, title: 'Create a Company Goal', desc: 'Set the high-level outcomes your company is working toward this period.', href: '/goals?create=goal', doneKey: 'hasGoals' },
  { num: 4, title: 'Add KRAs to your Goals', desc: 'KRAs break goals into measurable result areas owned by each department.', href: '/goals?create=kra', doneKey: 'hasKras' },
  { num: 5, title: 'Assign the first Task', desc: 'Tasks linked to KRAs roll execution up to your company goals automatically.', href: '/tasks', doneKey: 'hasTasks' },
];

const DEPT_HEAD_STEPS: SetupStep[] = [
  { num: 1, title: 'Create a Department Goal', desc: 'Define what your department is working toward this quarter.', href: '/goals?create=goal', doneKey: 'hasGoals' },
  { num: 2, title: 'Add KRAs for your Department', desc: 'KRAs make your goal measurable. Each KRA needs a target and owner.', href: '/goals?create=kra', doneKey: 'hasKras' },
  { num: 3, title: 'Assign Tasks to your Team', desc: 'Break KRAs into actionable tasks and assign them to team members.', href: '/tasks', doneKey: 'hasTasks' },
  { num: 4, title: 'Run a Daily Standup', desc: '15-minute daily ritual to keep your team aligned and unblocked.', href: '/standup', doneKey: 'hasStandup' },
];

const MANAGER_STEPS: SetupStep[] = [
  { num: 1, title: 'Assign Tasks to your Team', desc: 'Create tasks for your direct reports and link them to KRAs.', href: '/tasks', doneKey: 'hasTasks' },
  { num: 2, title: 'Run a Daily Standup', desc: 'Schedule a 15-minute standup to track progress across your team.', href: '/standup', doneKey: 'hasStandup' },
];

type Checks = Record<string, boolean>;

const STEP_ICONS: Record<string, React.ElementType> = {
  hasDepts: Building2,
  hasMembers: Users,
  hasGoals: Target,
  hasKras: TrendingUp,
  hasTasks: CheckSquare,
  hasStandup: Zap,
};

function SetupGuide({ role, checks }: { role: string; checks: Checks }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(`gr_setup_${role}`) === '1'
  );

  const steps =
    ['OWNER', 'COMPANY_ADMIN'].includes(role) ? CEO_STEPS
    : role === 'DEPARTMENT_HEAD' ? DEPT_HEAD_STEPS
    : role === 'MANAGER' ? MANAGER_STEPS
    : null;

  if (!steps || dismissed) return null;

  const doneCount = steps.filter((s) => checks[s.doneKey]).length;
  const allDone = doneCount === steps.length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className={cn(
      'overflow-hidden border',
      allDone ? 'border-green-200 bg-gradient-to-br from-green-50/60 to-emerald-50/40' : 'border-blue-200 bg-gradient-to-br from-blue-50/60 to-indigo-50/40'
    )}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-semibold text-sm flex items-center gap-2">
              {allDone
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <Zap className="h-4 w-4 text-blue-500" />
              }
              {allDone ? 'Setup Complete!' : 'Getting Started'}
              <span className="text-xs font-normal text-muted-foreground">{doneCount} of {steps.length} done</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {allDone
                ? 'Your workspace is fully set up. Dismiss this when ready.'
                : 'Follow these steps in order — each one unlocks the next.'
              }
            </p>
          </div>
          <button
            onClick={() => { localStorage.setItem(`gr_setup_${role}`, '1'); setDismissed(true); }}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Flow nodes */}
        <div className="flex flex-col sm:flex-row sm:items-stretch gap-0">
          {steps.map((step, idx) => {
            const done = checks[step.doneKey];
            const prevDone = steps.slice(0, idx).every((s) => checks[s.doneKey]);
            const isNext = !done && prevDone;
            const isLast = idx === steps.length - 1;
            const Icon = STEP_ICONS[step.doneKey] || Target;

            return (
              <div key={step.num} className="flex flex-col sm:flex-row sm:items-stretch flex-1 min-w-0">
                {/* Node card */}
                <div className={cn(
                  'flex-1 flex flex-col items-center text-center p-3 sm:p-4 rounded-xl border transition-all',
                  done
                    ? 'bg-green-50 border-green-200'
                    : isNext
                    ? 'bg-white border-blue-300 shadow-md ring-1 ring-blue-100'
                    : 'bg-white/50 border-dashed border-border'
                )}>
                  {/* Icon circle */}
                  <div className={cn(
                    'relative flex h-11 w-11 items-center justify-center rounded-full mb-2 shrink-0',
                    done ? 'bg-green-500' : isNext ? 'bg-blue-500' : 'bg-muted'
                  )}>
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    ) : (
                      <>
                        <Icon className={cn('h-5 w-5', isNext ? 'text-white' : 'text-muted-foreground/60')} />
                        {!isNext && (
                          <Lock className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 text-muted-foreground bg-white rounded-full border border-border p-0.5" />
                        )}
                      </>
                    )}
                    {isNext && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
                      </span>
                    )}
                  </div>

                  {/* Step label */}
                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-widest mb-0.5',
                    done ? 'text-green-600' : isNext ? 'text-blue-500' : 'text-muted-foreground/50'
                  )}>
                    Step {step.num}
                  </span>

                  {/* Title */}
                  <p className={cn(
                    'text-xs font-semibold leading-snug mb-1',
                    done ? 'line-through text-muted-foreground' : isNext ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {step.title}
                  </p>

                  {/* Description — visible on desktop */}
                  <p className="hidden sm:block text-[10px] text-muted-foreground leading-relaxed flex-1 mb-2">
                    {step.desc}
                  </p>

                  {/* CTA */}
                  {done ? (
                    <span className="text-[10px] font-medium text-green-600 flex items-center gap-0.5 mt-auto">
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </span>
                  ) : (
                    <Link
                      to={isNext ? step.href : '#'}
                      className={cn(
                        'mt-auto text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors',
                        isNext
                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                          : 'bg-muted text-muted-foreground pointer-events-none opacity-40'
                      )}
                    >
                      {isNext ? '→ Start' : 'Locked'}
                    </Link>
                  )}
                </div>

                {/* Connector */}
                {!isLast && (
                  <>
                    {/* Desktop: right chevron */}
                    <div className="hidden sm:flex items-center justify-center w-7 shrink-0 self-center">
                      <ChevronRight className={cn(
                        'h-4 w-4',
                        done ? 'text-green-400' : 'text-border'
                      )} />
                    </div>
                    {/* Mobile: down arrow */}
                    <div className="flex sm:hidden items-center justify-center h-5 self-center">
                      <ArrowDown className={cn(
                        'h-3.5 w-3.5',
                        done ? 'text-green-400' : 'text-border'
                      )} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Setup progress</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResourceCapacityCard() {
  const { data: workload = [], isLoading } = useQuery<Array<{
    id: string; name: string; email: string; role: string; departmentName: string | null; activeTaskCount: number;
  }>>({
    queryKey: ['users-workload'],
    queryFn: () => api.get('/users/workload').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500 animate-pulse" />
            Resource Capacity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (workload.length === 0) return null;

  return (
    <Card className="hover:shadow-md transition-all duration-300 border border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-500" />
          Resource Capacity
          <Badge variant="outline" className="ml-auto text-[10px] uppercase font-bold tracking-wider text-emerald-700 border-emerald-200 bg-emerald-50">
            Least Loaded
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Team members with the most available bandwidth</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {workload.map((member) => {
            const taskCount = member.activeTaskCount;
            let badgeClass = 'bg-green-50 text-green-700 border-green-200';
            let statusText = '0 active tasks';

            if (taskCount > 0 && taskCount <= 2) {
              badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
              statusText = `${taskCount} active task${taskCount > 1 ? 's' : ''}`;
            } else if (taskCount > 2) {
              badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
              statusText = `${taskCount} active tasks`;
            }

            return (
              <Link
                key={member.id}
                to={`/team/${member.id}/report`}
                className="flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-primary/20 hover:bg-muted/40 transition-all group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs shrink-0 group-hover:scale-105 transition-transform">
                    {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{member.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate uppercase tracking-wider">
                      {member.role.toLowerCase().replace(/_/g, ' ')} {member.departmentName ? `· ${member.departmentName}` : ''}
                    </p>
                  </div>
                </div>
                <Badge className={cn('text-xs border font-medium shrink-0', badgeClass)}>
                  {statusText}
                </Badge>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Department dashboard (when slug is present) ──────────────────────────────

type DeptDashboard = {
  overdueCount: number; blockedCount: number; dueTodayCount: number;
  kras: Array<{ id: string; name: string; status: string; current: number; target: number; unit?: string }>;
  recentStandup: { id: string; status: string; scheduledAt: string; _count: { cards: number } } | null;
  topBlockers: Array<{ blockerType: string | null; _count: number }>;
};

type DeptMember = { id: string; name: string; role: string; status: string; avatarUrl?: string };
type DeptDetail = { id: string; name: string; users: DeptMember[]; _count: { tasks: number; standups: number } };

function DepartmentDashboard({ slug }: { slug: string }) {
  const { user } = useAuthStore();
  const isManagerOrHead = ['DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const isCeo = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');

  const { data: dash } = useQuery<DeptDashboard>({
    queryKey: ['dept-dashboard', slug],
    queryFn: () => api.get(`/departments/${slug}/dashboard`).then((r) => r.data),
  });

  const { data: dept } = useQuery<DeptDetail>({
    queryKey: ['dept-detail', slug],
    queryFn: () => api.get(`/departments/${slug}`).then((r) => r.data),
  });

  const { data: learningStats } = useQuery<{ completionRate: number; totalAssigned: number; overdue: number }>({
    queryKey: ['learning-dept', slug],
    queryFn: () => api.get(`/learning/${slug}/dashboard`).then((r) => r.data),
  });

  if (!dash) {
    return (
      <div className="p-4 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{dept?.name || slug} Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Department execution overview</p>
      </div>

      {/* Widget row 1: task counts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
        <StatCard title="Overdue Tasks" value={dash.overdueCount} icon={Clock} color="text-red-500" bg="bg-red-50"
          subtitle="Past due date" href="/tasks?status=overdue" />
        <StatCard title="Blocked Today" value={dash.blockedCount} icon={AlertTriangle} color="text-orange-500" bg="bg-orange-50"
          subtitle="Need resolution" href="/tasks?status=BLOCKED" />
        <StatCard title="Due Today" value={dash.dueTodayCount} icon={Calendar} color="text-blue-500" bg="bg-blue-50"
          subtitle="Pending tasks" href="/tasks?status=due_today" />
      </div>

      {/* Overdue alert banner */}
      {dash.overdueCount > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="font-semibold text-sm text-red-800">
                {dash.overdueCount} overdue task{dash.overdueCount > 1 ? 's' : ''} in this department need attention
              </span>
            </div>
            <Link to="/tasks?status=overdue" className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline shrink-0">
              View tasks →
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget 4: KRA Progress */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-500" />
              KRA Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dash.kras.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No KRAs set for this department</p>
            ) : (
              <div className="space-y-4">
                {dash.kras.map((kra) => {
                  return (
                    <Link key={kra.id} to="/goals" className="block p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate flex-1 mr-4">{kra.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={cn('text-xs border', kraStatusColor(kra.status))}>{kra.status.replace('_', ' ')}</Badge>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Widget 5: Team */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Team ({dept?.users.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {(dept?.users || []).slice(0, 8).map((member) => (
                  <Link key={member.id} to={`/team/${member.id}/report`} className="flex items-center gap-2 p-1.5 -mx-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={cn('h-2 w-2 rounded-full shrink-0', member.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300')} />
                    <span className="text-sm flex-1 truncate">{member.name}</span>
                    <span className="text-xs text-muted-foreground capitalize shrink-0">{member.role.toLowerCase().replace(/_/g, ' ')}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
          {(isManagerOrHead || isCeo) && <ResourceCapacityCard />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget 6: Top Blockers breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Blocker Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dash.topBlockers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">No blockers — great!</div>
            ) : (
              <div className="space-y-3">
                {dash.topBlockers.map((b) => (
                  <div key={b.blockerType || 'null'} className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm capitalize">{(b.blockerType || 'unknown').toLowerCase().replace(/_/g, ' ')}</p>
                    </div>
                    <Badge variant="destructive" className="text-xs">{b._count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Widget 7: Recent standup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Last Standup
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dash.recentStandup ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {formatDate(dash.recentStandup.scheduledAt)}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{dash.recentStandup._count.cards} participants</span>
                  <Badge className={cn('text-xs', {
                    'bg-green-100 text-green-700': dash.recentStandup.status === 'COMPLETED',
                    'bg-blue-100 text-blue-700': dash.recentStandup.status === 'IN_PROGRESS',
                    'bg-gray-100 text-gray-600': dash.recentStandup.status === 'SCHEDULED',
                  })}>
                    {dash.recentStandup.status.replace('_', ' ')}
                  </Badge>
                </div>
                <Link to="/standup" className="text-xs text-primary hover:underline">View standup →</Link>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">No standups yet</div>
            )}
          </CardContent>
        </Card>

        {/* Widget 8: Learning stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-indigo-500" />
                Learning
              </span>
              {slug && <Link to={`/learning/${slug}`} className="text-xs text-indigo-600 hover:underline">View all →</Link>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {learningStats ? (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">Completion rate</span>
                    <span className="font-medium">{learningStats.completionRate}%</span>
                  </div>
                  <Progress value={learningStats.completionRate} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-center pt-1">
                  <div>
                    <p className="text-xl font-bold text-indigo-600">{learningStats.totalAssigned}</p>
                    <p className="text-xs text-muted-foreground">Assigned</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-red-600">{learningStats.overdue}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Widget 9: Tasks summary */}
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
              { label: 'Total Tasks', value: dept?._count.tasks || 0, color: 'text-foreground', href: '/tasks' },
              { label: 'Overdue', value: dash.overdueCount, color: 'text-red-600', href: '/tasks?status=overdue' },
              { label: 'Blocked', value: dash.blockedCount, color: 'text-orange-600', href: '/tasks?status=BLOCKED' },
              { label: 'Due Today', value: dash.dueTodayCount, color: 'text-blue-600', href: '/tasks?status=due_today' },
            ].map(({ label, value, color, href }) => (
              <Link key={label} to={href} className="block p-4 rounded-lg bg-muted/40 hover:bg-muted/70 hover:shadow-sm transition-all">
                <p className={cn('text-2xl font-bold', color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Generic dashboard (no slug) ──────────────────────────────────────────────

export default function Dashboard() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isManagerOrHead = ['DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const departmentLabel = user?.departmentName || departmentNameFromSlug(user?.departmentSlug);
  const designationLabel = user?.role?.toLowerCase().replace(/_/g, ' ') || '';

  const isCeo = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');

  const { data: cockpit, isLoading: cockpitLoading } = useQuery({
    queryKey: ['cockpit'],
    queryFn: () => api.get('/owner/cockpit').then((r) => r.data),
    enabled: !slug && isCeo,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
    enabled: !slug,
  });

  const { data: setupGoals = [], isLoading: goalsLoading } = useQuery<{ id: string }[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data),
    enabled: !slug,
  });

  const { data: setupKras = [], isLoading: krasLoading } = useQuery<{ id: string }[]>({
    queryKey: ['kras'],
    queryFn: () => api.get('/kras').then((r) => r.data),
    enabled: !slug,
  });

  // If a department slug is in the URL, show department dashboard
  if (slug) return <DepartmentDashboard slug={slug} />;

  const allTasks: Task[] = tasks || [];

  // Don't render the guide until all relevant queries have settled — prevents the
  // "show for 200ms then vanish" flash caused by checks starting as all-false.
  const checksReady =
    !goalsLoading && !krasLoading && !tasksLoading && (!isCeo || !cockpitLoading);

  const setupChecks: Checks = {
    hasDepts:   (cockpit?.departments?.length  ?? 0) > 0,
    hasMembers: (cockpit?.totalUsers           ?? 0) > 1,
    hasGoals:   setupGoals.length > 0,
    hasKras:    setupKras.length  > 0,
    hasTasks:   (cockpit?.tasks?.total ?? allTasks.length) > 0,
    hasStandup: false,
  };

  const now = new Date();
  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

  const isOverdue = (t: Task) => {
    if (!t.dueDate || t.status === 'DONE' || t.status === 'CANCELLED') return false;
    const d = new Date(t.dueDate);
    return d < now;
  };
  const isDueToday = (t: Task) => {
    if (!t.dueDate || t.status === 'DONE' || t.status === 'CANCELLED') return false;
    const d = new Date(t.dueDate);
    return d >= now && d <= endOfToday;
  };

  // All tasks the API returns are already scoped by role:
  //   TEAM_MEMBER   → own tasks only
  //   MANAGER       → own + direct-reports tasks
  //   DEPARTMENT_HEAD → all dept tasks
  const openTasks     = allTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
  const dueTodayTasks = allTasks.filter(isDueToday);
  const overdueTasks  = allTasks.filter(isOverdue);
  const blockedTasks  = allTasks.filter((t) => t.status === 'BLOCKED');
  const doneTasks     = allTasks.filter((t) => t.status === 'DONE');

  // Personal tasks (assigned directly to this user)
  const myOpenTasks = openTasks.filter((t) => t.assignee?.id === user?.id);
  // Team tasks = open tasks NOT assigned to me (only meaningful for manager/head)
  const teamOpenTasks = openTasks.filter((t) => t.assignee?.id !== user?.id);

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {isManagerOrHead && departmentLabel && (
          <p className="text-sm font-medium text-primary mt-2">
            {designationLabel} · {departmentLabel} Department
          </p>
        )}
      </div>

      {/* Setup guide — only rendered after queries settle so it never flashes */}
      {user?.role && checksReady && <SetupGuide role={user.role} checks={setupChecks} />}

      {/* Overdue alert — visible to CEO / dept head / manager when team tasks are overdue */}
      {(isCeo || isManagerOrHead) && overdueTasks.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="font-semibold text-sm text-red-800">
                {overdueTasks.length} Overdue Task{overdueTasks.length > 1 ? 's' : ''} — Action Required
              </span>
            </div>
            <Link to="/tasks?status=overdue" className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline shrink-0">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-red-100">
            {overdueTasks.slice(0, 5).map((task) => {
              const dueDay = new Date(task.dueDate!); dueDay.setHours(0, 0, 0, 0);
              const daysOverdue = Math.round((todayDate.getTime() - dueDay.getTime()) / 86400000);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-100/60 transition-colors cursor-pointer"
                  onClick={() => navigate(`/tasks?status=overdue&taskId=${task.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/tasks?status=overdue&taskId=${task.id}`);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <p className="text-sm font-medium text-red-900 flex-1 truncate">{task.title}</p>
                  {task.assignee && (
                    <Link
                      to={`/team/${task.assignee.id}/report`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="text-xs text-primary shrink-0 font-medium hover:underline"
                    >
                      {task.assignee.name}
                    </Link>
                  )}
                  <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-semibold shrink-0">
                    {daysOverdue <= 0 ? 'Overdue' : daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}
                  </span>
                </div>
              );
            })}
            {overdueTasks.length > 5 && (
              <div className="px-4 py-2 text-center">
                <Link to="/tasks?status=overdue" className="text-xs text-red-600 hover:underline">
                  +{overdueTasks.length - 5} more overdue tasks
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CEO stat cards */}
      {cockpit && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Active Users" value={cockpit.activeUsers} icon={Users} color="text-white" bg="bg-blue-500"
            subtitle={`of ${cockpit.totalUsers} total`} href="/team" />
          <StatCard title="Tasks Done" value={cockpit.tasks?.done || 0} icon={CheckSquare} color="text-white" bg="bg-green-500"
            subtitle={`of ${cockpit.tasks?.total || 0} total`} href="/tasks?status=DONE" />
          <StatCard title="Overdue Tasks" value={cockpit.tasks?.overdue || 0} icon={Clock} color="text-white" bg="bg-orange-500"
            href="/tasks?status=overdue" />
          <StatCard title="Blocked" value={cockpit.tasks?.blocked || 0} icon={AlertTriangle} color="text-white" bg="bg-red-500"
            href="/tasks?status=BLOCKED" />
        </div>
      )}

      {/* Task stats for all non-CEO roles */}
      {!isCeo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Open Tasks" value={openTasks.length} icon={CheckSquare} color="text-blue-600" bg="bg-blue-50"
            subtitle={`${doneTasks.length} done`} href="/tasks" />
          <StatCard title="Due Today" value={dueTodayTasks.length} icon={Calendar} color="text-orange-600" bg="bg-orange-50"
            href="/tasks?status=due_today" />
          <StatCard title="Overdue" value={overdueTasks.length} icon={Clock} color="text-red-600" bg="bg-red-50"
            href="/tasks?status=overdue" />
          <StatCard title="Blocked" value={blockedTasks.length} icon={AlertTriangle} color="text-red-600" bg="bg-red-50"
            href="/tasks?status=BLOCKED" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks panel — My Tasks always shown; team tasks below for manager/head */}
        <div className="lg:col-span-2 space-y-4">
          {/* My Tasks — always personal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-blue-500" />
                My Tasks
                <Badge variant="secondary" className="ml-auto">{myOpenTasks.length} open</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myOpenTasks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No tasks assigned to you</p>
                  <Link to="/tasks" className="text-xs text-primary hover:underline mt-1 inline-block">Go to Tasks →</Link>
                </div>
              ) : (
                <TaskList tasks={myOpenTasks} isOverdue={isOverdue} isDueToday={isDueToday} showAssignee={false} onTaskClick={(taskId) => navigate(`/tasks?taskId=${taskId}`)} />
              )}
            </CardContent>
          </Card>

          {/* Team Tasks — only for manager / dept head */}
          {isManagerOrHead && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  {user?.role === 'DEPARTMENT_HEAD' ? 'Department Tasks' : 'Team Tasks'}
                  <Badge variant="secondary" className="ml-auto">{teamOpenTasks.length} open</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {teamOpenTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No open tasks for your team</p>
                ) : (
                  <TaskList tasks={teamOpenTasks} isOverdue={isOverdue} isDueToday={isDueToday} showAssignee={true} onTaskClick={(taskId) => navigate(`/tasks?taskId=${taskId}`)} />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right panel: Blockers for team member / Team summary + blockers for manager/head */}
        <div className="space-y-4">
          {/* Team summary — only for manager / dept head */}
          {isManagerOrHead && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Team Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Open', value: openTasks.length, color: 'text-blue-600', href: '/tasks' },
                  { label: 'Done', value: doneTasks.length, color: 'text-green-600', href: '/tasks?status=DONE' },
                  { label: 'Overdue', value: overdueTasks.length, color: 'text-red-600', href: '/tasks?status=overdue' },
                  { label: 'Blocked', value: blockedTasks.length, color: 'text-orange-600', href: '/tasks?status=BLOCKED' },
                ].map(({ label, value, color, href }) => (
                  <Link key={label} to={href} className="block rounded-lg bg-muted/40 p-3 text-center hover:bg-muted/70 hover:shadow-sm transition-all">
                    <p className={cn('text-xl font-bold', color)}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Resource Capacity */}
          {(isManagerOrHead || isCeo) && <ResourceCapacityCard />}

          {/* Blockers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                {isManagerOrHead ? 'Team Blockers' : 'Blockers'}
                <Badge variant={blockedTasks.length > 0 ? 'destructive' : 'secondary'} className="ml-auto">
                  {blockedTasks.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {blockedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No blockers — great!</p>
              ) : (
                <div className="space-y-2">
                  {blockedTasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="p-2.5 rounded-md bg-red-50 border border-red-100">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-red-900 truncate flex-1">{task.title}</p>
                        {isManagerOrHead && task.assignee && (
                          <Link
                            to={`/team/${task.assignee.id}/report`}
                            className="text-xs text-primary shrink-0 hover:underline"
                          >
                            {task.assignee.name.split(' ')[0]}
                          </Link>
                        )}
                      </div>
                      {task.blockerType && (
                        <p className="text-xs text-red-500 mt-0.5 capitalize">{task.blockerType.toLowerCase().replace(/_/g, ' ')}</p>
                      )}
                    </div>
                  ))}
                  {blockedTasks.length > 5 && (
                    <Link to="/tasks" className="block text-center text-xs text-primary hover:underline pt-1">
                      View all {blockedTasks.length} →
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* KRA Health (owners/admins) */}
      {cockpit?.kras && cockpit.kras.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-500" />
              KRA Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cockpit.kras.map((kra: { id: string; name: string; status: string; current: number; target: number; department?: { name: string } }) => {
                return (
                  <Link key={kra.id} to="/goals" className="block p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium truncate">{kra.name}</p>
                        {kra.department && <p className="text-xs text-muted-foreground">{kra.department.name}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn('text-xs border', kraStatusColor(kra.status))}>{kra.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Department execution */}
      {cockpit?.departments && cockpit.departments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Department Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cockpit.departments.map((dept: { id: string; name: string; slug?: string; _count: { tasks: number; kras: number; users: number } }) => (
                <Link
                  key={dept.id}
                  to={dept.slug ? `/dashboard/${dept.slug}` : '#'}
                  className="block p-4 rounded-lg border hover:shadow-sm transition-shadow hover:border-primary/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium text-sm">{dept.name}</p>
                    <span className="text-xs text-muted-foreground">{dept._count.users} people</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{dept._count.tasks} tasks</span>
                    <span>{dept._count.kras} KRAs</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
