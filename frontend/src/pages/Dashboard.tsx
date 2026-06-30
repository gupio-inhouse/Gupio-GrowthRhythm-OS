import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  CheckSquare, AlertTriangle, Zap, TrendingUp, Users, Clock, Target,
  Calendar, X, ChevronRight, Building2, CheckCircle2, Lock, ArrowDown,
  FolderKanban, ArrowUpRight, Activity, Flame,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/authStore';
import { cn, formatDate, getInitials, formatRelative, isEngineeringDept } from '@/lib/utils';
import api from '@/api/client';

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function departmentNameFromSlug(slug?: string) {
  if (!slug) return '';
  const parts = slug.split('-').filter(Boolean);
  const cleaned = parts.length > 1 && /[0-9]/.test(parts[parts.length - 1]) ? parts.slice(0, -1) : parts;
  return cleaned.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Task = {
  id: string; title: string; status: string; priority: string;
  dueDate?: string; blockerType?: string;
  assignee?: { id: string; name: string };
};
type Checks = Record<string, boolean>;
type DeptDashboard = {
  overdueCount: number; blockedCount: number; dueTodayCount: number;
  recentStandup: { id: string; status: string; scheduledAt: string; _count: { cards: number } } | null;
  topBlockers: Array<{ blockerType: string | null; _count: number }>;
};
type DeptMember = { id: string; name: string; role: string; status: string; avatarUrl?: string };
type TeamSummary = {
  id: string; name: string; description?: string; memberCount: number;
  manager?: { id: string; name: string };
  department: { id: string; name: string; slug: string };
};
type DeptDetail = { id: string; name: string; users: DeptMember[]; _count: { tasks: number; standups: number } };

// ── Palette ───────────────────────────────────────────────────────────────────
const PRIORITY_CLS: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH:     'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  LOW:      'bg-gray-50 text-gray-600 border-gray-200',
};
const STATUS_DOT: Record<string, string> = {
  BLOCKED:     'bg-red-500',
  IN_PROGRESS: 'bg-blue-500',
  IN_REVIEW:   'bg-amber-400',
  DONE:        'bg-green-500',
  TODO:        'bg-slate-300',
};

// ── Shared card icon ──────────────────────────────────────────────────────────
function CIcon({ icon: I, bg, cls }: { icon: React.ElementType; bg: string; cls: string }) {
  return (
    <div className={cn('h-7 w-7 rounded-xl flex items-center justify-center shrink-0', bg)}>
      <I className={cn('h-3.5 w-3.5', cls)} />
    </div>
  );
}

// ── Premium KPI tile ──────────────────────────────────────────────────────────
function GradientKpi({
  label, value, sub, icon: Icon, from, to, shadow, onClick,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; from: string; to: string; shadow: string;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left group w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl">
      <Card className={cn(
        'relative overflow-hidden rounded-2xl border-0 transition-all duration-300 shadow-lg',
        'group-hover:scale-[1.02] group-hover:shadow-xl bg-gradient-to-br',
        shadow, from, to,
      )}>
        <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardContent className="relative p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <ArrowUpRight className="h-4 w-4 text-white/50 group-hover:text-white transition-colors" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none">{value}</p>
          <p className="text-xs sm:text-sm text-white/90 mt-1.5 font-semibold">{label}</p>
          {sub && <p className="text-[10px] sm:text-xs text-white/60 mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </button>
  );
}

// ── Flat KPI tile (non-CEO) ───────────────────────────────────────────────────
function FlatKpi({
  label, value, sub, icon: Icon, color, tint, href,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; tint: string; href: string;
}) {
  return (
    <Link to={href} className="group block">
      <Card className="rounded-2xl border border-border/60 bg-white hover:shadow-lg hover:border-primary/20 transition-all duration-200 overflow-hidden">
        <div className="h-0.5 w-full" style={{ background: color }} />
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="p-2 rounded-xl" style={{ background: tint }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors mt-0.5" />
          </div>
          <p className="text-2xl sm:text-3xl font-black tabular-nums leading-none" style={{ color }}>{value}</p>
          <p className="text-xs font-semibold text-foreground/70 mt-1">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({
  task, isOverdue, isDueToday, showAssignee, onClick,
}: {
  task: Task; isOverdue: boolean; isDueToday: boolean; showAssignee: boolean; onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group',
        isOverdue
          ? 'border-red-100 bg-red-50/40 hover:bg-red-50/70 hover:border-red-200'
          : 'border-border/60 bg-white hover:bg-muted/30 hover:border-primary/20 hover:shadow-sm',
      )}
    >
      <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', STATUS_DOT[task.status] ?? 'bg-slate-300')} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate group-hover:text-primary transition-colors', task.status === 'DONE' && 'line-through text-muted-foreground')}>
          {task.title}
        </p>
        {showAssignee && task.assignee && (
          <Link
            to={`/team/${task.assignee.id}/report`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="text-xs text-primary hover:underline truncate inline-block mt-0.5"
          >
            {task.assignee.name}
          </Link>
        )}
      </div>

      {isOverdue && (
        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
          Overdue
        </span>
      )}
      {isDueToday && !isOverdue && (
        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          Today
        </span>
      )}
      {!isOverdue && !isDueToday && task.dueDate && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(task.dueDate)}</span>
      )}
      <Badge className={cn('shrink-0 text-[10px] border rounded-full hidden sm:flex', PRIORITY_CLS[task.priority] ?? '')}>
        {task.priority}
      </Badge>
    </div>
  );
}

// ── Task list ─────────────────────────────────────────────────────────────────
function TaskList({
  tasks, isOverdueFn, isDueTodayFn, showAssignee, onTaskClick,
}: {
  tasks: Task[];
  isOverdueFn: (t: Task) => boolean;
  isDueTodayFn: (t: Task) => boolean;
  showAssignee: boolean;
  onTaskClick: (id: string) => void;
}) {
  const sorted = [...tasks]
    .sort((a, b) => {
      const rank = (t: Task) => isOverdueFn(t) ? 0 : isDueTodayFn(t) ? 1 : t.dueDate ? 2 : 3;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    })
    .slice(0, 8);

  return (
    <div className="space-y-1.5">
      {sorted.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          isOverdue={isOverdueFn(task)}
          isDueToday={isDueTodayFn(task)}
          showAssignee={showAssignee}
          onClick={() => onTaskClick(task.id)}
        />
      ))}
      {tasks.length > 8 && (
        <Link to="/tasks" className="block text-center text-xs text-primary hover:underline pt-2 font-medium">
          View all {tasks.length} tasks →
        </Link>
      )}
    </div>
  );
}

// ── Setup Guide ───────────────────────────────────────────────────────────────
type SetupStep = { num: number; title: string; desc: string; href: string; doneKey: string };

const CEO_STEPS: SetupStep[] = [
  { num: 1, title: 'Create your first Department', desc: 'Organise your company into functional teams (e.g. Engineering, Sales).', href: '/departments', doneKey: 'hasDepts' },
  { num: 2, title: 'Invite Team Members', desc: 'Add people and assign them to departments.', href: '/team', doneKey: 'hasMembers' },
  { num: 3, title: 'Assign the first Task', desc: 'Assign tasks to drive execution.', href: '/tasks', doneKey: 'hasTasks' },
];
const DEPT_HEAD_STEPS: SetupStep[] = [
  { num: 1, title: 'Assign Tasks to your Team', desc: 'Assign tasks to members and track progress.', href: '/tasks', doneKey: 'hasTasks' },
  { num: 2, title: 'Run a Daily Meeting', desc: '15-minute ritual to keep your team aligned.', href: '/standup', doneKey: 'hasStandup' },
];
const MANAGER_STEPS: SetupStep[] = [
  { num: 1, title: 'Assign Tasks to your Team', desc: 'Create tasks for your direct reports.', href: '/tasks', doneKey: 'hasTasks' },
  { num: 2, title: 'Run a Daily Meeting', desc: 'Schedule a 15-minute meeting.', href: '/standup', doneKey: 'hasStandup' },
];
const STEP_ICONS: Record<string, React.ElementType> = {
  hasDepts: Building2, hasMembers: Users, hasTasks: CheckSquare, hasStandup: Zap,
};

function SetupGuide({ role, checks }: { role: string; checks: Checks }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(`gr_setup_${role}`) === '1');

  const steps =
    ['OWNER', 'COMPANY_ADMIN'].includes(role) ? CEO_STEPS
    : role === 'DEPARTMENT_HEAD' ? DEPT_HEAD_STEPS
    : role === 'MANAGER' ? MANAGER_STEPS
    : null;

  if (!steps || dismissed) return null;

  const doneCount = steps.filter((s) => checks[s.doneKey]).length;
  const allDone   = doneCount === steps.length;
  const pct       = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className={cn(
      'rounded-2xl border overflow-hidden',
      allDone
        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-green-50/40'
        : 'border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-blue-50/40',
    )}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-semibold text-sm flex items-center gap-2">
              {allDone
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                : <Zap className="h-4 w-4 text-indigo-500" />}
              {allDone ? 'Setup Complete!' : 'Getting Started'}
              <span className="text-xs font-normal text-muted-foreground">{doneCount} of {steps.length} done</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {allDone
                ? 'Your workspace is fully set up.'
                : 'Follow these steps in order to unlock the next.'}
            </p>
          </div>
          <button
            onClick={() => { localStorage.setItem(`gr_setup_${role}`, '1'); setDismissed(true); }}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
          {steps.map((step, idx) => {
            const done    = checks[step.doneKey];
            const prevDone = steps.slice(0, idx).every((s) => checks[s.doneKey]);
            const isNext  = !done && prevDone;
            const isLast  = idx === steps.length - 1;
            const Icon    = STEP_ICONS[step.doneKey] || Target;

            return (
              <div key={step.num} className="flex flex-col sm:flex-row sm:items-stretch flex-1 min-w-0">
                <div className={cn(
                  'flex-1 flex flex-col items-center text-center p-3 sm:p-4 rounded-2xl border transition-all',
                  done    ? 'bg-emerald-50/80 border-emerald-200'
                  : isNext ? 'bg-white border-indigo-300 shadow-md ring-1 ring-indigo-100'
                  :          'bg-white/50 border-dashed border-border',
                )}>
                  <div className={cn(
                    'relative flex h-11 w-11 items-center justify-center rounded-full mb-2 shrink-0',
                    done ? 'bg-gradient-to-br from-emerald-400 to-green-500'
                    : isNext ? 'bg-gradient-to-br from-indigo-500 to-blue-600'
                    : 'bg-muted',
                  )}>
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    ) : (
                      <>
                        <Icon className={cn('h-5 w-5', isNext ? 'text-white' : 'text-muted-foreground/50')} />
                        {!isNext && (
                          <Lock className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 text-muted-foreground bg-white rounded-full border border-border p-0.5" />
                        )}
                      </>
                    )}
                    {isNext && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
                      </span>
                    )}
                  </div>

                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-widest mb-0.5',
                    done ? 'text-emerald-600' : isNext ? 'text-indigo-500' : 'text-muted-foreground/40',
                  )}>Step {step.num}</span>

                  <p className={cn(
                    'text-xs font-semibold leading-snug mb-1',
                    done ? 'line-through text-muted-foreground' : isNext ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {step.title}
                  </p>
                  <p className="hidden sm:block text-[10px] text-muted-foreground leading-relaxed flex-1 mb-2">{step.desc}</p>

                  {done ? (
                    <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-auto">
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </span>
                  ) : (
                    <Link
                      to={isNext ? step.href : '#'}
                      className={cn(
                        'mt-auto text-[10px] px-3 py-1.5 rounded-xl font-semibold transition-colors',
                        isNext
                          ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white hover:from-indigo-600 hover:to-blue-700'
                          : 'bg-muted text-muted-foreground pointer-events-none opacity-40',
                      )}
                    >
                      {isNext ? '→ Start' : 'Locked'}
                    </Link>
                  )}
                </div>

                {!isLast && (
                  <>
                    <div className="hidden sm:flex items-center justify-center w-6 shrink-0 self-center">
                      <ChevronRight className={cn('h-4 w-4', done ? 'text-emerald-400' : 'text-border')} />
                    </div>
                    <div className="flex sm:hidden items-center justify-center h-5 self-center">
                      <ArrowDown className={cn('h-3.5 w-3.5', done ? 'text-emerald-400' : 'text-border')} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Setup progress</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Resource Capacity ─────────────────────────────────────────────────────────
function ResourceCapacityCard() {
  const { data: workload = [], isLoading } = useQuery<Array<{
    id: string; name: string; email: string; role: string;
    departmentName: string | null; activeTaskCount: number;
  }>>({
    queryKey: ['users-workload'],
    queryFn: () => api.get('/users/workload').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl border border-border/60 bg-white">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CIcon icon={Users} bg="bg-emerald-100" cls="text-emerald-600" />
            Resource Capacity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-11 rounded-xl bg-muted animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!workload.length) return null;

  return (
    <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CIcon icon={Users} bg="bg-emerald-100" cls="text-emerald-600" />
          Resource Capacity
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            Least Loaded
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Available bandwidth</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-1">
          {workload.map((m) => {
            const n = m.activeTaskCount;
            const [bg, text, bar] =
              n === 0  ? ['bg-emerald-50',  'text-emerald-700',  'bg-emerald-400'] :
              n <= 2   ? ['bg-blue-50',     'text-blue-700',     'bg-blue-400']   :
                         ['bg-amber-50',    'text-amber-700',    'bg-amber-400'];
            const pct = Math.min(n * 20, 100);
            return (
              <Link
                key={m.id}
                to={`/team/${m.id}/report`}
                className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/40 transition-colors group"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                  {getInitials(m.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{m.name}</p>
                  <div className="h-1 w-full bg-muted rounded-full mt-1 overflow-hidden">
                    <div className={cn('h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0', bg, text)}>
                  {n === 0 ? 'Free' : `${n} task${n > 1 ? 's' : ''}`}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Department dashboard ──────────────────────────────────────────────────────
function DepartmentDashboard({ slug }: { slug: string }) {
  const { user } = useAuthStore();
  const isManagerOrHead = ['DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const isCeo = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');
  const navigate = useNavigate();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const { data: dash } = useQuery<DeptDashboard>({
    queryKey: ['dept-dashboard', slug],
    queryFn: () => api.get(`/departments/${slug}/dashboard`).then((r) => r.data),
  });
  const { data: dept } = useQuery<DeptDetail>({
    queryKey: ['dept-detail', slug],
    queryFn: () => api.get(`/departments/${slug}`).then((r) => r.data),
  });
  const isEngDept = isEngineeringDept(dept?.name);

  const { data: allTeams = [] } = useQuery<TeamSummary[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
    enabled: !!dept && isEngineeringDept(dept?.name),
  });

  const deptTeams   = allTeams.filter((t) => t.department.slug === slug);
  const selectedTeam = deptTeams.find((t) => t.id === selectedTeamId) ?? null;

  if (!dash) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-4 sm:p-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-[1200px] mx-auto">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Projects Sidebar — Engineering dept only */}
      {isEngDept && (
        <div className="hidden lg:flex flex-col w-64 shrink-0 border-r bg-gradient-to-b from-slate-50 to-white overflow-y-auto">
          <div className="px-4 py-4 border-b">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Projects</p>
            <p className="text-sm font-semibold mt-0.5 truncate">{dept?.name || slug}</p>
          </div>
          <div className="flex-1 p-2 space-y-1">
            {deptTeams.length === 0 ? (
              <div className="text-center py-10 px-3">
                <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-2">
                  <FolderKanban className="h-5 w-5 text-indigo-300" />
                </div>
                <p className="text-xs text-muted-foreground">No projects yet</p>
                <Link to="/teams" className="text-xs text-primary hover:underline mt-1 inline-block">Create one →</Link>
              </div>
            ) : (
              deptTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(selectedTeamId === team.id ? null : team.id)}
                  className={cn(
                    'w-full text-left rounded-xl px-3 py-2.5 transition-all',
                    selectedTeamId === team.id
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200'
                      : 'hover:bg-muted text-foreground',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FolderKanban className={cn('h-3.5 w-3.5 shrink-0', selectedTeamId === team.id ? 'text-white' : 'text-indigo-500')} />
                    <p className="text-sm font-semibold truncate">{team.name}</p>
                  </div>
                  <p className={cn('text-[10px] mt-0.5', selectedTeamId === team.id ? 'text-white/70' : 'text-muted-foreground')}>
                    {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                    {team.manager ? ` · ${team.manager.name}` : ''}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
        {selectedTeam ? (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedTeamId(null)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 lg:hidden"
              >
                ← Back
              </button>
              <div className="flex items-center gap-3 flex-1">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                  <FolderKanban className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedTeam.name}</h2>
                  {selectedTeam.description && <p className="text-sm text-muted-foreground">{selectedTeam.description}</p>}
                </div>
              </div>
              <Link
                to={`/dashboard/${slug}?project=${selectedTeam.id}`}
                className="text-xs text-primary hover:underline shrink-0 font-medium"
              >
                Full view →
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
                <CardContent className="p-4">
                  <p className="text-2xl font-black tabular-nums">{selectedTeam.memberCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Members</p>
                </CardContent>
              </Card>
              {selectedTeam.manager && (
                <Card className="rounded-2xl border border-border/60 bg-white shadow-sm col-span-2 sm:col-span-1">
                  <CardContent className="p-4">
                    <p className="text-sm font-bold truncate">{selectedTeam.manager.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Project Manager</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/30 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">View full project details</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Members, tasks, documents and more</p>
                </div>
                <Link
                  to={`/dashboard/${slug}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-xs font-semibold text-white hover:from-indigo-600 hover:to-violet-700 transition-all shadow-sm shrink-0"
                >
                  <FolderKanban className="h-3.5 w-3.5" /> Open Department
                </Link>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{dept?.name || slug} Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Department execution overview</p>
            </div>

            {/* Stat KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Overdue Tasks', value: dash.overdueCount,  icon: Clock,          color: '#ef4444', tint: '#fef2f2', href: '/tasks?status=overdue' },
                { label: 'Blocked',       value: dash.blockedCount,  icon: AlertTriangle,   color: '#f97316', tint: '#fff7ed', href: '/tasks?status=BLOCKED' },
                { label: 'Due Today',     value: dash.dueTodayCount, icon: Calendar,        color: '#3b82f6', tint: '#eff6ff', href: '/tasks?status=due_today' },
              ].map(({ label, value, icon, color, tint, href }) => (
                <FlatKpi key={label} label={label} value={value} icon={icon} color={color} tint={tint} href={href} />
              ))}
            </div>

            {/* Urgency banner */}
            {dash.overdueCount > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 flex-wrap">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span className="font-semibold text-sm text-red-800 flex-1">
                  {dash.overdueCount} overdue task{dash.overdueCount > 1 ? 's' : ''} need attention
                </span>
                <Link to="/tasks?status=overdue" className="text-xs font-semibold text-red-600 hover:underline shrink-0">
                  View all →
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Team members */}
              <div className="space-y-4">
                <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
                  <CardHeader className="px-5 pt-4 pb-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CIcon icon={Users} bg="bg-blue-100" cls="text-blue-600" />
                      Team ({dept?.users.length ?? 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-3">
                    <div className="space-y-0.5">
                      {(dept?.users ?? []).slice(0, 8).map((m) => (
                        <Link
                          key={m.id}
                          to={`/team/${m.id}/report`}
                          className="flex items-center gap-2.5 px-2 py-2 -mx-1 rounded-xl hover:bg-muted/40 transition-colors group"
                        >
                          <span className={cn('h-2 w-2 rounded-full shrink-0', m.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300')} />
                          <span className="text-xs flex-1 truncate font-medium group-hover:text-primary transition-colors">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                            {m.role.toLowerCase().replace(/_/g, ' ')}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                {(isManagerOrHead || isCeo) && <ResourceCapacityCard />}
              </div>

              {/* Blocker types */}
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={AlertTriangle} bg="bg-red-100" cls="text-red-600" />
                    Blocker Types
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-3">
                  {dash.topBlockers.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-3 text-muted-foreground">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                        <CheckSquare className="h-6 w-6 text-emerald-400" />
                      </div>
                      <p className="text-sm font-medium text-emerald-700">No blockers!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dash.topBlockers.map((b) => {
                        const max = Math.max(...dash.topBlockers.map((x) => x._count));
                        const pct = max > 0 ? Math.round((b._count / max) * 100) : 0;
                        return (
                          <div key={b.blockerType ?? 'null'} className="cursor-pointer" onClick={() => navigate('/tasks?status=BLOCKED')}>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-medium capitalize">
                                {(b.blockerType ?? 'Unknown').toLowerCase().replace(/_/g, ' ')}
                              </p>
                              <span className="text-xs font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">{b._count}</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-red-50 overflow-hidden">
                              <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Last standup */}
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={Zap} bg="bg-yellow-100" cls="text-yellow-600" />
                    Last Meeting
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-3">
                  {dash.recentStandup ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">{formatDate(dash.recentStandup.scheduledAt)}</p>
                      <div>
                        <span className="text-3xl font-black tabular-nums">{dash.recentStandup._count.cards}</span>
                        <span className="text-sm text-muted-foreground ml-1.5">participants</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <span className={cn(
                          'text-xs font-semibold px-2.5 py-1 rounded-full',
                          dash.recentStandup.status === 'COMPLETED'  ? 'bg-emerald-100 text-emerald-700'
                          : dash.recentStandup.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600',
                        )}>
                          {dash.recentStandup.status.replace('_', ' ')}
                        </span>
                        <Link to="/standup" className="text-xs text-primary hover:underline font-medium">View →</Link>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                      <Zap className="h-8 w-8 opacity-20" />
                      <p className="text-sm">No meetings yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Task summary */}
            <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
              <CardHeader className="px-5 pt-4 pb-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CIcon icon={TrendingUp} bg="bg-teal-100" cls="text-teal-600" />
                  Task Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total',     value: dept?._count.tasks ?? 0, color: '#6366f1', tint: '#eef2ff', href: '/tasks' },
                    { label: 'Overdue',   value: dash.overdueCount,       color: '#ef4444', tint: '#fef2f2', href: '/tasks?status=overdue' },
                    { label: 'Blocked',   value: dash.blockedCount,       color: '#f97316', tint: '#fff7ed', href: '/tasks?status=BLOCKED' },
                    { label: 'Due Today', value: dash.dueTodayCount,      color: '#3b82f6', tint: '#eff6ff', href: '/tasks?status=due_today' },
                  ].map(({ label, value, color, tint, href }) => (
                    <Link
                      key={label}
                      to={href}
                      className="block rounded-2xl p-4 text-center hover:scale-[1.02] hover:shadow-md transition-all"
                      style={{ background: tint }}
                    >
                      <p className="text-2xl font-black tabular-nums" style={{ color }}>{value}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Mobile project list */}
            {deptTeams.length > 0 && (
              <div className="lg:hidden">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-indigo-500" />
                    Projects ({deptTeams.length})
                  </h2>
                  <Link to="/teams" className="text-xs text-primary hover:underline">Manage →</Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {deptTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className="text-left rounded-2xl border border-border/60 bg-white px-4 py-3.5 hover:border-indigo-300 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-indigo-500 shrink-0" />
                        <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{team.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate  = useNavigate();
  const { user }  = useAuthStore();

  const isManagerOrHead = ['DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const isCeo           = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');
  const departmentLabel = user?.departmentName || departmentNameFromSlug(user?.departmentSlug);
  const designationLabel = user?.role?.toLowerCase().replace(/_/g, ' ') || '';

  const [activeUsersOpen, setActiveUsersOpen] = useState(false);

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
  const useAllDeptTeams = ['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(user?.role || '');
  const { data: myProjectTeams } = useQuery({
    queryKey: useAllDeptTeams ? ['teams'] : ['teams', 'managed'],
    queryFn: () => (useAllDeptTeams ? api.get('/teams') : api.get('/teams/managed')).then((r) => r.data),
    enabled: !slug,
  });

  if (slug) return <DepartmentDashboard slug={slug} />;

  const allTasks: Task[] = tasks || [];
  const checksReady = !tasksLoading && (!isCeo || !cockpitLoading);

  const now        = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const isOverdue  = (t: Task) => !!t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) < now;
  const isDueToday = (t: Task) => !!t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) >= now && new Date(t.dueDate) <= todayEnd;

  const openTasks     = allTasks.filter((t) => !['DONE', 'CANCELLED'].includes(t.status));
  const dueTodayTasks = allTasks.filter(isDueToday);
  const overdueTasks  = allTasks.filter(isOverdue);
  const blockedTasks  = allTasks.filter((t) => t.status === 'BLOCKED');
  const doneTasks     = allTasks.filter((t) => t.status === 'DONE');
  const myOpenTasks   = openTasks.filter((t) => t.assignee?.id === user?.id);
  const teamOpenTasks = openTasks.filter((t) => t.assignee?.id !== user?.id);

  const setupChecks: Checks = {
    hasDepts:   (cockpit?.departments?.length  ?? 0) > 0,
    hasMembers: (cockpit?.totalUsers           ?? 0) > 1,
    hasTasks:   (cockpit?.tasks?.total ?? allTasks.length) > 0,
    hasStandup: false,
  };

  type ProjTeam = { id: string; name: string; description?: string; memberCount: number; department?: { name: string; slug?: string } };
  const projectTeams = (myProjectTeams as ProjTeam[] | undefined) ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {greeting()}, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {isManagerOrHead && departmentLabel && (
                <p className="text-xs font-semibold text-primary mt-0.5 capitalize">
                  {designationLabel} · {departmentLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              to="/tasks"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-2 text-xs font-semibold hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <CheckSquare className="h-3.5 w-3.5 text-indigo-500" /> My Tasks
            </Link>
            <Link
              to="/standup"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-semibold text-white hover:from-indigo-600 hover:to-violet-700 shadow-sm shadow-indigo-200 transition-all"
            >
              <Zap className="h-3.5 w-3.5" /> Meeting
            </Link>
          </div>
        </div>

        {/* ── Setup guide ── */}
        {user?.role && checksReady && <SetupGuide role={user.role} checks={setupChecks} />}

        {/* ── Overdue alert ── */}
        {(isCeo || isManagerOrHead) && overdueTasks.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-red-100">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-red-600 shrink-0" />
                <span className="font-bold text-sm text-red-800">
                  {overdueTasks.length} Overdue Task{overdueTasks.length > 1 ? 's' : ''} — Action Required
                </span>
              </div>
              <Link to="/tasks?status=overdue" className="text-xs font-semibold text-red-600 hover:underline shrink-0">
                View all →
              </Link>
            </div>
            <div className="divide-y divide-red-100/60">
              {overdueTasks.slice(0, 4).map((task) => {
                const dueDay = new Date(task.dueDate!); dueDay.setHours(0, 0, 0, 0);
                const days   = Math.round((todayStart.getTime() - dueDay.getTime()) / 86400000);
                return (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/tasks?status=overdue&taskId=${task.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/tasks?status=overdue&taskId=${task.id}`); }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-100/50 transition-colors cursor-pointer"
                  >
                    <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                    <p className="text-sm font-medium text-red-900 flex-1 truncate">{task.title}</p>
                    {task.assignee && (
                      <Link
                        to={`/team/${task.assignee.id}/report`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary shrink-0 font-semibold hover:underline"
                      >
                        {task.assignee.name}
                      </Link>
                    )}
                    <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full shrink-0">
                      {days <= 0 ? 'Overdue' : days === 1 ? '1d overdue' : `${days}d overdue`}
                    </span>
                  </div>
                );
              })}
              {overdueTasks.length > 4 && (
                <div className="px-4 py-2 text-center">
                  <Link to="/tasks?status=overdue" className="text-xs text-red-600 font-semibold hover:underline">
                    +{overdueTasks.length - 4} more
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CEO KPI cards ── */}
        {cockpit && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <GradientKpi
              label="Active Today" value={cockpit.activeUsers}
              sub={`of ${cockpit.totalUsers} total`}
              icon={Users} from="from-sky-500" to="to-blue-600" shadow="shadow-blue-200"
              onClick={() => setActiveUsersOpen(true)}
            />
            <GradientKpi
              label="Tasks Done" value={cockpit.tasks?.done ?? 0}
              sub={`of ${cockpit.tasks?.total ?? 0} total`}
              icon={CheckSquare} from="from-emerald-500" to="to-green-600" shadow="shadow-green-200"
              onClick={() => navigate('/tasks?status=DONE')}
            />
            <GradientKpi
              label="Overdue Tasks" value={cockpit.tasks?.overdue ?? 0}
              sub="past due date"
              icon={Clock} from="from-amber-500" to="to-orange-600" shadow="shadow-amber-200"
              onClick={() => navigate('/tasks?status=overdue')}
            />
            <GradientKpi
              label="Blocked" value={cockpit.tasks?.blocked ?? 0}
              sub="need resolution"
              icon={AlertTriangle} from="from-red-500" to="to-rose-600" shadow="shadow-red-200"
              onClick={() => navigate('/tasks?status=BLOCKED')}
            />
          </div>
        )}

        {/* ── Non-CEO KPI tiles ── */}
        {!isCeo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FlatKpi label="Open Tasks"  value={openTasks.length}     sub={`${doneTasks.length} done`}  icon={CheckSquare}   color="#6366f1" tint="#eef2ff" href="/tasks" />
            <FlatKpi label="Due Today"   value={dueTodayTasks.length}                                    icon={Calendar}      color="#f97316" tint="#fff7ed" href="/tasks?status=due_today" />
            <FlatKpi label="Overdue"     value={overdueTasks.length}                                     icon={Clock}         color="#ef4444" tint="#fef2f2" href="/tasks?status=overdue" />
            <FlatKpi label="Blocked"     value={blockedTasks.length}                                     icon={AlertTriangle} color="#f43f5e" tint="#fff1f2" href="/tasks?status=BLOCKED" />
          </div>
        )}

        {/* ── My Projects ── */}
        {projectTeams.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FolderKanban className="h-4 w-4 text-indigo-500" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">My Projects</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {projectTeams.map((team) => (
                <Link
                  key={team.id}
                  to={team.department?.slug ? `/departments/${team.department.slug}` : '/team'}
                  className="block rounded-2xl border border-border/60 bg-white p-4 hover:shadow-lg hover:border-indigo-200 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center shrink-0 group-hover:from-indigo-200 group-hover:to-violet-200 transition-colors">
                      <FolderKanban className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{team.name}</p>
                      {team.department && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="h-2.5 w-2.5" /> {team.department.name}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5 shrink-0">
                      {team.memberCount}
                    </span>
                  </div>
                  {team.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{team.description}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Main grid: tasks + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Tasks column */}
          <div className="lg:col-span-2 space-y-4">
            {/* My Tasks */}
            <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
              <div className="h-0.5 w-full bg-gradient-to-r from-indigo-400 to-violet-500" />
              <CardHeader className="px-5 pt-4 pb-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CIcon icon={CheckSquare} bg="bg-indigo-100" cls="text-indigo-600" />
                  My Tasks
                  <span className="ml-auto text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-1">
                    {myOpenTasks.length} open
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                {myOpenTasks.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
                    <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                      <CheckSquare className="h-7 w-7 opacity-30" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">No tasks assigned</p>
                      <Link to="/tasks" className="text-xs text-primary hover:underline mt-1 inline-block">Go to Tasks →</Link>
                    </div>
                  </div>
                ) : (
                  <TaskList
                    tasks={myOpenTasks}
                    isOverdueFn={isOverdue}
                    isDueTodayFn={isDueToday}
                    showAssignee={false}
                    onTaskClick={(id) => navigate(`/tasks?taskId=${id}`)}
                  />
                )}
              </CardContent>
            </Card>

            {/* Team Tasks */}
            {isManagerOrHead && (
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                <div className="h-0.5 w-full bg-gradient-to-r from-sky-400 to-blue-500" />
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={Users} bg="bg-sky-100" cls="text-sky-600" />
                    {user?.role === 'DEPARTMENT_HEAD' ? 'Department Tasks' : 'Team Tasks'}
                    <span className="ml-auto text-[10px] font-bold bg-sky-50 text-sky-600 rounded-full px-2.5 py-1">
                      {teamOpenTasks.length} open
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3">
                  {teamOpenTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No open tasks for your team</p>
                  ) : (
                    <TaskList
                      tasks={teamOpenTasks}
                      isOverdueFn={isOverdue}
                      isDueTodayFn={isDueToday}
                      showAssignee
                      onTaskClick={(id) => navigate(`/tasks?taskId=${id}`)}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Team overview — manager/head only */}
            {isManagerOrHead && (
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={TrendingUp} bg="bg-teal-100" cls="text-teal-600" />
                    Team Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Open',    value: openTasks.length,    color: '#6366f1', tint: '#eef2ff', href: '/tasks' },
                    { label: 'Done',    value: doneTasks.length,    color: '#10b981', tint: '#ecfdf5', href: '/tasks?status=DONE' },
                    { label: 'Overdue', value: overdueTasks.length, color: '#ef4444', tint: '#fef2f2', href: '/tasks?status=overdue' },
                    { label: 'Blocked', value: blockedTasks.length, color: '#f97316', tint: '#fff7ed', href: '/tasks?status=BLOCKED' },
                  ].map(({ label, value, color, tint, href }) => (
                    <Link
                      key={label}
                      to={href}
                      className="block rounded-xl p-3 text-center hover:scale-[1.02] hover:shadow-md transition-all"
                      style={{ background: tint }}
                    >
                      <p className="text-xl font-black tabular-nums" style={{ color }}>{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{label}</p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Resource capacity */}
            {(isManagerOrHead || isCeo) && <ResourceCapacityCard />}

            {/* Blockers */}
            <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
              <div className={cn('h-0.5 w-full', blockedTasks.length > 0 ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-muted')} />
              <CardHeader className="px-5 pt-4 pb-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CIcon icon={AlertTriangle} bg="bg-red-100" cls="text-red-600" />
                  {isManagerOrHead ? 'Team Blockers' : 'Blockers'}
                  <span className={cn(
                    'ml-auto text-[10px] font-bold rounded-full px-2.5 py-1',
                    blockedTasks.length > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground',
                  )}>
                    {blockedTasks.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                {blockedTasks.length === 0 ? (
                  <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                      <CheckSquare className="h-5 w-5 text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-emerald-700">No blockers!</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {blockedTasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-xl bg-red-50/60 border border-red-100 hover:border-red-200 hover:bg-red-50 transition-all cursor-pointer"
                        onClick={() => navigate(`/tasks?taskId=${task.id}`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-red-900 truncate flex-1">{task.title}</p>
                          {isManagerOrHead && task.assignee && (
                            <Link
                              to={`/team/${task.assignee.id}/report`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-primary shrink-0 hover:underline font-semibold"
                            >
                              {task.assignee.name.split(' ')[0]}
                            </Link>
                          )}
                        </div>
                        {task.blockerType && (
                          <p className="text-[10px] text-red-500 mt-1 capitalize font-medium">
                            {task.blockerType.toLowerCase().replace(/_/g, ' ')}
                          </p>
                        )}
                      </div>
                    ))}
                    {blockedTasks.length > 5 && (
                      <Link to="/tasks?status=BLOCKED" className="block text-center text-xs text-primary hover:underline pt-1 font-medium">
                        View all {blockedTasks.length} →
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Department overview (CEO) ── */}
        {cockpit?.departments?.length > 0 && (
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CIcon icon={Building2} bg="bg-violet-100" cls="text-violet-600" />
                Department Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cockpit.departments.map((dept: { id: string; name: string; slug?: string; _count: { tasks: number; users: number } }, i: number) => {
                  const grads = [
                    ['from-indigo-500', 'to-violet-600'],
                    ['from-sky-500', 'to-blue-600'],
                    ['from-teal-500', 'to-emerald-600'],
                    ['from-amber-500', 'to-orange-600'],
                    ['from-rose-500', 'to-pink-600'],
                  ];
                  const [f, t] = grads[i % grads.length];
                  return (
                    <Link
                      key={dept.id}
                      to={dept.slug ? `/dashboard/${dept.slug}` : '#'}
                      className="block rounded-2xl border border-border/60 bg-white p-4 hover:shadow-lg hover:border-primary/20 transition-all group overflow-hidden relative"
                    >
                      <div className={cn('absolute top-0 left-0 right-0 h-1 bg-gradient-to-r', f, t)} />
                      <div className="flex items-center justify-between mb-2 pt-1">
                        <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-sm', f, t)}>
                          <Building2 className="h-4 w-4 text-white" />
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </div>
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">{dept.name}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{dept._count.users}</span>
                        <span className="flex items-center gap-1"><CheckSquare className="h-3 w-3" />{dept._count.tasks} tasks</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Active users dialog ── */}
      <Dialog open={activeUsersOpen} onOpenChange={setActiveUsersOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-xl bg-sky-100 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-sky-600" />
              </div>
              Active Today
              <span className="ml-1 text-[10px] font-bold bg-sky-100 text-sky-700 rounded-full px-2 py-0.5">
                {cockpit?.activeUsers ?? 0}
              </span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-3">Logged in within the last 24 hours</p>
          {!(cockpit?.activeUsersList?.length) ? (
            <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
              <Users className="h-8 w-8 opacity-20" />
              <p className="text-sm">No one logged in today yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {(cockpit.activeUsersList as Array<{
                id: string; name: string; role: string; lastLoginAt: string; department?: { name: string };
              }>).map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 hover:bg-muted/30 transition-colors">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-sky-50 text-sky-700 text-xs font-bold rounded-full">
                      {getInitials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate capitalize">
                      {u.role.toLowerCase().replace(/_/g, ' ')}{u.department ? ` · ${u.department.name}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{formatRelative(u.lastLoginAt)}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
