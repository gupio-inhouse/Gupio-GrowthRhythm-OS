import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  CheckSquare, AlertTriangle, Zap, TrendingUp, Users, Clock, Target,
  Calendar, X, ChevronRight, Building2,
  FolderKanban, ArrowUpRight, Activity, Flame, Shield, SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  members?: Array<{ user: { id: string; name: string; role: string } }>;
};
type DeptDetail = { id: string; name: string; users: DeptMember[]; _count: { tasks: number; standups: number } };

// ── Chart palette ─────────────────────────────────────────────────────────────
const C = {
  indigo:  '#6366f1',
  violet:  '#8b5cf6',
  green:   '#22c55e',
  emerald: '#10b981',
  amber:   '#f59e0b',
  orange:  '#f97316',
  red:     '#ef4444',
  rose:    '#f43f5e',
  teal:    '#14b8a6',
  sky:     '#0ea5e9',
  blue:    '#3b82f6',
  slate:   '#94a3b8',
};
const BLOCKER_COLORS = [C.red, C.amber, C.violet, C.indigo, C.teal];

function ChartTip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-white/95 backdrop-blur-sm shadow-2xl px-4 py-3 min-w-[130px]">
      {label && <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">{label}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-xs text-muted-foreground capitalize flex-1">{p.name}</span>
          <span className="text-sm font-bold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function PieTip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-2xl border border-border/60 bg-white/95 backdrop-blur-sm shadow-2xl px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.payload.color }} />
        <span className="text-xs text-muted-foreground">{p.name}</span>
        <span className="text-sm font-bold ml-3 tabular-nums">{p.value}</span>
      </div>
    </div>
  );
}

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn('rounded-2xl bg-gradient-to-r from-muted via-muted/60 to-muted animate-pulse', className)} />;
}

// ── SVG Gauge arc ─────────────────────────────────────────────────────────────
function GaugeArc({ percent, color }: { percent: number; color: string }) {
  const SIZE = 200, CX = SIZE / 2, CY = SIZE / 2 + 10, R = 78, SW = 16, START = 135, SWEEP = 270;
  function toXY(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  }
  function arc(startDeg: number, endDeg: number) {
    const s = toXY(startDeg), e = toXY(endDeg);
    const diff = ((endDeg - startDeg) % 360 + 360) % 360;
    return `M ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${R} ${R} 0 ${diff > 180 ? 1 : 0} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)}`;
  }
  const bgEnd = START + SWEEP;
  const safeEnd = percent > 0 ? START + (SWEEP * Math.min(Math.max(percent, 0), 100)) / 100 : START + 0.01;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" style={{ maxHeight: 190 }}>
      <path d={arc(START, bgEnd)} fill="none" stroke="#f1f5f9" strokeWidth={SW} strokeLinecap="round" />
      <path d={arc(START, safeEnd)} fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      {percent > 2 && (() => { const tip = toXY(safeEnd); return <circle cx={tip.x} cy={tip.y} r={SW / 2 + 1} fill={color} opacity={0.35} />; })()}
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize={38} fontWeight={900} fill={color} fontFamily="inherit">{percent}</text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize={13} fontWeight={600} fill={color} opacity={0.7} fontFamily="inherit">%</text>
      <text x={CX} y={CY + 32} textAnchor="middle" fontSize={10} fill="#94a3b8" fontFamily="inherit">completion rate</text>
    </svg>
  );
}

// ── Workload chart ─────────────────────────────────────────────────────────────
function WorkloadChart({ filterQs }: { filterQs: string }) {
  const navigate = useNavigate();
  const { data: workload = [], isLoading } = useQuery<Array<{
    id: string; name: string; email: string; role: string;
    departmentName: string | null; activeTaskCount: number;
  }>>({
    queryKey: ['users-workload', filterQs],
    queryFn: () => api.get(`/users/workload${filterQs ? `?${filterQs}` : ''}`).then((r) => r.data),
  });
  const chartData = [...workload].sort((a, b) => b.activeTaskCount - a.activeTaskCount).slice(0, 8)
    .map((m) => ({ name: m.name.split(' ')[0], tasks: m.activeTaskCount, id: m.id }));
  const yAxisWidth = chartData.length ? Math.max(64, Math.min(130, Math.max(...chartData.map((d) => d.name.length)) * 7 + 10)) : 64;
  if (isLoading) return (
    <div className="space-y-2.5 pt-2">
      {[90, 78, 66, 54, 42].map((w, i) => (
        <div key={i} className="h-7 rounded-xl bg-gradient-to-r from-muted via-muted/60 to-muted animate-pulse" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
  if (!chartData.length) return (
    <div className="flex flex-col items-center justify-center h-44 text-muted-foreground gap-3">
      <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center"><Users className="h-7 w-7 opacity-30" /></div>
      <p className="text-sm font-medium">No workload data yet</p>
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
        onClick={(d) => { if (d?.activePayload?.[0]) navigate(`/team/${(d.activePayload[0].payload as { id: string }).id}/report`); }}
      >
        <defs>
          <linearGradient id="wlGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.indigo} /><stop offset="100%" stopColor={C.violet} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 600 }} width={yAxisWidth} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(99,102,241,0.04)', radius: 8 }} />
        <Bar dataKey="tasks" fill="url(#wlGrad)" radius={[0, 8, 8, 0]} name="Active Tasks" maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── OwnerHome (combined CEO view) ─────────────────────────────────────────────
type Department = { id: string; name: string; slug?: string; _count: { tasks: number; users: number } };

function OwnerHome() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [activeUsersOpen, setActiveUsersOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // filterQs for cockpit endpoints (uses assigneeId)
  const filterQs = (() => {
    const p = new URLSearchParams();
    if (departmentFilter) p.set('departmentId', departmentFilter);
    if (memberFilter) p.set('assigneeId', memberFilter);
    if (dateFilter) {
      p.set('from', new Date(dateFilter + 'T00:00:00').toISOString());
      p.set('to',   new Date(dateFilter + 'T23:59:59').toISOString());
    }
    return p.toString();
  })();
  // tasksQs for /tasks endpoint (uses assigneeUserId)
  const tasksQs = (() => {
    const p = new URLSearchParams();
    if (departmentFilter) p.set('departmentId', departmentFilter);
    if (memberFilter) p.set('assigneeUserId', memberFilter);
    if (dateFilter) {
      p.set('from', new Date(dateFilter + 'T00:00:00').toISOString());
      p.set('to',   new Date(dateFilter + 'T23:59:59').toISOString());
    }
    return p.toString();
  })();
  const qs = filterQs ? `?${filterQs}` : '';
  const tqs = tasksQs ? `?${tasksQs}` : '';
  const activeFilterCount = [departmentFilter, memberFilter, dateFilter].filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ['cockpit', filterQs],
    queryFn: () => api.get(`/owner/cockpit${qs}`).then((r) => r.data),
  });
  const { data: weekly } = useQuery({
    queryKey: ['cockpit-weekly', filterQs],
    queryFn: () => api.get(`/owner/cockpit/weekly-summary${qs}`).then((r) => r.data),
  });
  const { data: blockers } = useQuery({
    queryKey: ['cockpit-blockers', filterQs],
    queryFn: () => api.get(`/owner/cockpit/blockers${qs}`).then((r) => r.data),
  });
  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks-cockpit', tasksQs],
    queryFn: () => api.get(`/tasks${tqs}`).then((r) => r.data),
  });
  const { data: allUsers = [] } = useQuery<{ id: string; name: string; departmentId?: string }[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });


  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const isOverdue  = (t: Task) => !!t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) < now;
  const isDueToday = (t: Task) => !!t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) >= now && new Date(t.dueDate) <= todayEnd;
  const overdueTasks   = allTasks.filter(isOverdue);
  const dueTodayTasks  = allTasks.filter(isDueToday);
  // When a member filter is active, "my tasks" panel shows that member's tasks
  const myTasksOwnerId = memberFilter || user?.id;
  const myTasks        = allTasks.filter((t) => t.assignee?.id === myTasksOwnerId && !['DONE', 'CANCELLED'].includes(t.status));
  const urgentTasks    = allTasks.filter((t) => !['DONE', 'CANCELLED'].includes(t.status) && (isOverdue(t) || isDueToday(t) || ['CRITICAL', 'HIGH'].includes(t.priority)));
  const selectedMemberName = memberFilter ? (allUsers.find((u) => u.id === memberFilter)?.name ?? 'Member') : null;

  const membersInDept = departmentFilter ? allUsers.filter((u) => u.departmentId === departmentFilter) : allUsers;

  const tasks       = data?.tasks ?? { total: 0, done: 0, overdue: 0, blocked: 0 };
  const taskHealth  = tasks.total > 0 ? Math.min(100, Math.round((tasks.done / tasks.total) * 100)) : 0;
  const activeAmt   = Math.max(tasks.total - tasks.done - tasks.blocked - tasks.overdue, 0);
  const healthColor = taskHealth >= 70 ? C.emerald : taskHealth >= 40 ? C.amber : C.red;

  const taskDonut = [
    { name: 'Done',    value: tasks.done,   color: C.emerald },
    { name: 'Active',  value: activeAmt,     color: C.indigo  },
    { name: 'Overdue', value: tasks.overdue, color: C.amber   },
    { name: 'Blocked', value: tasks.blocked, color: C.red     },
  ].filter((d) => d.value > 0);

  const deptBar = (data?.departments ?? []).map((d: Department) => ({
    name:   d.name.length > 11 ? d.name.slice(0, 11) + '…' : d.name,
    tasks:  d._count.tasks,
    people: d._count.users,
    slug:   d.slug,
  }));

  const blockerDonut = (blockers?.blockersByType ?? []).map((
    b: { blockerType: string; _count: number }, i: number,
  ) => ({
    name:  (b.blockerType ?? 'Unknown').replace(/_/g, ' '),
    value: b._count,
    color: BLOCKER_COLORS[i % BLOCKER_COLORS.length],
  }));

  const kpis = [
    {
      label: 'Active Members', value: data?.activeUsers ?? 0, sub: `of ${data?.totalUsers ?? 0} total`,
      icon: Users, from: 'from-sky-500', to: 'to-blue-600', shadow: 'shadow-blue-200',
      onClick: () => setActiveUsersOpen(true),
    },
    {
      label: 'Task Health', value: `${taskHealth}%`, sub: `${tasks.done} of ${tasks.total} done`,
      icon: Target,
      from: taskHealth >= 70 ? 'from-emerald-500' : taskHealth >= 40 ? 'from-amber-400' : 'from-red-500',
      to:   taskHealth >= 70 ? 'to-green-600'    : taskHealth >= 40 ? 'to-orange-500'  : 'to-rose-600',
      shadow: taskHealth >= 70 ? 'shadow-green-200' : taskHealth >= 40 ? 'shadow-amber-200' : 'shadow-red-200',
      onClick: () => navigate('/tasks'),
    },
    {
      label: 'Departments', value: data?.departments?.length ?? 0, sub: 'active',
      icon: Building2, from: 'from-violet-500', to: 'to-purple-600', shadow: 'shadow-violet-200',
      onClick: () => navigate('/departments'),
    },
    {
      label: 'Blockers', value: tasks.blocked, sub: tasks.blocked === 0 ? 'all clear!' : 'need resolution',
      icon: tasks.blocked === 0 ? Shield : Flame,
      from: tasks.blocked === 0 ? 'from-teal-400' : 'from-red-500',
      to:   tasks.blocked === 0 ? 'to-emerald-500' : 'to-rose-600',
      shadow: tasks.blocked === 0 ? 'shadow-teal-200' : 'shadow-red-200',
      onClick: () => navigate('/tasks?status=BLOCKED'),
    },
    {
      label: 'Due Today', value: dueTodayTasks.length, sub: dueTodayTasks.length === 0 ? 'nothing due' : 'need completion',
      icon: Calendar,
      from: dueTodayTasks.length === 0 ? 'from-slate-400' : 'from-orange-500',
      to:   dueTodayTasks.length === 0 ? 'to-slate-500'   : 'to-amber-500',
      shadow: dueTodayTasks.length === 0 ? 'shadow-slate-200' : 'shadow-orange-200',
      onClick: () => navigate('/tasks?status=due_today'),
    },
  ];

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-10 w-52" /><SkeletonPulse className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <SkeletonPulse key={i} className="h-36" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[...Array(4)].map((_, i) => <SkeletonPulse key={i} className="h-80" />)}
      </div>
    </div>
  );

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
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
                filtersOpen || activeFilterCount > 0
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-border/60 bg-white text-muted-foreground hover:border-primary/40 hover:shadow-sm',
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
            <Button asChild variant="outline" size="sm" className="rounded-xl border-border/60 hover:border-primary/40 text-xs">
              <Link to="/departments?create=department">Add Dept</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 border-0 shadow-md shadow-indigo-200 text-xs">
              <Link to="/team">Manage Team</Link>
            </Button>
          </div>
        </div>

        {/* ── Collapsible filter bar ── */}
        {filtersOpen && (
          <div className="rounded-2xl border border-border/60 bg-white shadow-sm p-3 sm:p-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={departmentFilter || '__all__'} onValueChange={(v) => { setDepartmentFilter(v === '__all__' ? '' : v); setMemberFilter(''); }}>
                <SelectTrigger className="h-8 w-full sm:w-44 text-xs rounded-xl border-border/60">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="__all__">All Departments</SelectItem>
                  {(data?.departments ?? []).map((d: { id: string; name: string }) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={memberFilter || '__all__'} onValueChange={(v) => setMemberFilter(v === '__all__' ? '' : v)} disabled={membersInDept.length === 0}>
                <SelectTrigger className="h-8 w-full sm:w-44 text-xs rounded-xl border-border/60">
                  <SelectValue placeholder="All Members" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="__all__">All Members</SelectItem>
                  {membersInDept.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                </SelectContent>
              </Select>
              <input
                type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                className="h-8 rounded-xl border border-border/60 px-3 text-xs text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto"
              />
              {activeFilterCount > 0 && (
                <button onClick={() => { setDepartmentFilter(''); setMemberFilter(''); setDateFilter(''); }}
                  className="inline-flex items-center gap-1.5 h-8 rounded-xl border border-border/60 px-3 text-xs font-semibold text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all shrink-0"
                >
                  <X className="h-3 w-3" />Clear ({activeFilterCount})
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Alert banner ── */}
        {(overdueTasks.length > 0 || tasks.blocked > 0) && (
          <div className="rounded-2xl border border-red-200 bg-red-50/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-red-100">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-red-600 shrink-0" />
                <span className="font-bold text-sm text-red-800">
                  {overdueTasks.length > 0 && `${overdueTasks.length} overdue`}
                  {overdueTasks.length > 0 && tasks.blocked > 0 && ' · '}
                  {tasks.blocked > 0 && `${tasks.blocked} blocked`}
                  {' '}— needs attention
                </span>
              </div>
              <div className="flex gap-3">
                {overdueTasks.length > 0 && <Link to="/tasks?status=overdue" className="text-xs font-semibold text-red-600 hover:underline">Overdue →</Link>}
                {tasks.blocked > 0 && <Link to="/tasks?status=BLOCKED" className="text-xs font-semibold text-red-600 hover:underline">Blocked →</Link>}
              </div>
            </div>
            <div className="divide-y divide-red-100/60">
              {overdueTasks.slice(0, 3).map((task) => {
                const dueDay = new Date(task.dueDate!); dueDay.setHours(0, 0, 0, 0);
                const days = Math.round((todayStart.getTime() - dueDay.getTime()) / 86400000);
                return (
                  <div key={task.id} role="button" tabIndex={0}
                    onClick={() => navigate(`/tasks?status=overdue&taskId=${task.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/tasks?status=overdue&taskId=${task.id}`); }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-100/50 transition-colors cursor-pointer"
                  >
                    <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                    <p className="text-sm font-medium text-red-900 flex-1 truncate">{task.title}</p>
                    {task.assignee && (
                      <Link to={`/team/${task.assignee.id}/report`} onClick={(e) => e.stopPropagation()} className="text-xs text-primary shrink-0 font-semibold hover:underline">
                        {task.assignee.name}
                      </Link>
                    )}
                    <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full shrink-0">
                      {days <= 0 ? 'Overdue' : days === 1 ? '1d overdue' : `${days}d overdue`}
                    </span>
                  </div>
                );
              })}
              {overdueTasks.length > 3 && (
                <div className="px-4 py-2 text-center">
                  <Link to="/tasks?status=overdue" className="text-xs text-red-600 font-semibold hover:underline">+{overdueTasks.length - 3} more overdue</Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Department quick-access strip ── */}
        {(data?.departments ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">Departments</span>
            {(data.departments as Department[]).map((dept) => (
              <Link
                key={dept.id}
                to={dept.slug ? `/departments/${dept.slug}` : '#'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-border/60 text-xs font-semibold hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700 transition-all shadow-sm"
              >
                <Building2 className="h-3 w-3 opacity-60" />
                {dept.name}
              </Link>
            ))}
          </div>
        )}

        {/* ── 5 KPI cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
          {kpis.map(({ label, value, sub, icon: Icon, from, to, shadow, onClick }) => (
            <button key={label} onClick={onClick} className="text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl">
              <Card className={cn('relative overflow-hidden rounded-2xl border-0 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl bg-gradient-to-br shadow-lg', shadow, from, to)}>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
                <CardContent className="relative p-4 sm:p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" /></div>
                    <ArrowUpRight className="h-4 w-4 text-white/60 group-hover:text-white transition-colors" />
                  </div>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tabular-nums leading-none">{value}</p>
                  <p className="text-xs sm:text-sm text-white/90 mt-1.5 font-semibold">{label}</p>
                  <p className="text-[10px] sm:text-xs text-white/60 mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        {/* ── Weekly strip ── */}
        {weekly && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Completed this week', value: weekly.completedThisWeek, icon: CheckSquare, from: 'from-emerald-500', to: 'to-green-400', href: '/tasks?status=DONE' },
              { label: 'New blockers',         value: weekly.newBlockers,        icon: AlertTriangle, from: 'from-red-500', to: 'to-rose-400',   href: '/tasks?status=BLOCKED' },
              { label: 'Meetings held',         value: weekly.standupCount,       icon: Zap,          from: 'from-blue-500', to: 'to-indigo-400', href: '/standup' },
            ].map(({ label, value, icon: Icon, from, to, href }) => (
              <Link key={label} to={href} className="group">
                <Card className="rounded-2xl border border-border/60 bg-white hover:shadow-lg hover:border-primary/20 transition-all duration-200">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br shadow-sm', from, to)}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xl sm:text-2xl font-black tabular-nums leading-none">{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{label}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}


        {/* ── Task Health by Department ── */}
        <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-teal-500" />
          <CardHeader className="px-5 sm:px-6 pt-4 pb-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
              <CIcon icon={Target} bg="bg-emerald-100" cls="text-emerald-600" />
              Task Health by Department
              <span className="ml-auto text-[10px] font-bold rounded-full px-3 py-1" style={{ background: `${healthColor}18`, color: healthColor }}>
                Org: {taskHealth}% {taskHealth >= 70 ? '✓' : taskHealth >= 40 ? '⚠' : '✕'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 sm:px-6 pb-5 pt-4">
            {(data?.departments ?? []).length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                <Building2 className="h-8 w-8 opacity-20" />
                <p className="text-sm">No departments yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(data.departments as Array<Department & {
                  taskHealth: { total: number; done: number; blocked: number; overdue: number; pct: number };
                }>).map((dept) => {
                  const h = dept.taskHealth ?? { total: 0, done: 0, blocked: 0, overdue: 0, pct: 0 };
                  const isEmpty = h.total === 0;
                  const isGood  = h.pct >= 70;
                  const isWarn  = h.pct >= 40 && h.pct < 70;
                  const accent  = isEmpty ? '#94a3b8' : isGood ? '#059669' : isWarn ? '#d97706' : '#dc2626';
                  const accentBg= isEmpty ? '#f8fafc' : isGood ? '#f0fdf4' : isWarn ? '#fffbeb' : '#fff1f2';
                  const label   = isEmpty ? 'No tasks' : isGood ? 'Healthy' : isWarn ? 'Attention' : 'Critical';
                  // large SVG arc ring (r=30, viewBox 72×72)
                  const r = 30; const cx = 36; const cy = 36; const circ = 2 * Math.PI * r;
                  const dash = circ * (h.pct / 100);
                  return (
                    <Link
                      key={dept.id}
                      to={dept.slug ? `/dashboard/${dept.slug}` : '#'}
                      className="group block rounded-2xl bg-white border border-slate-100 overflow-hidden hover:-translate-y-1 transition-all duration-250 relative"
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)' }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 8px 30px rgba(0,0,0,0.10), 0 0 0 1.5px ${accent}50`)}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)')}
                    >
                      {/* Soft color wash behind top content */}
                      <div className="absolute inset-x-0 top-0 h-24 pointer-events-none" style={{ background: `linear-gradient(160deg, ${accent}0f 0%, transparent 100%)` }} />

                      <div className="relative p-4">
                        {/* Top row: dept info + ring */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="min-w-0 pt-0.5">
                            <p className="text-[13px] font-bold text-slate-800 truncate leading-tight">{dept.name}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{dept._count.users} members · {h.total} tasks</p>
                            <span
                              className="inline-block mt-2 text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                              style={{ background: `${accent}15`, color: accent }}
                            >{label}</span>
                          </div>

                          {/* Ring */}
                          <svg width="72" height="72" className="shrink-0" style={{ filter: `drop-shadow(0 3px 8px ${accent}35)` }}>
                            <circle cx={cx} cy={cy} r={r} fill={accentBg} />
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5.5" />
                            <circle
                              cx={cx} cy={cy} r={r} fill="none"
                              stroke={accent} strokeWidth="5.5" strokeLinecap="round"
                              strokeDasharray={`${dash} ${circ}`}
                              strokeDashoffset={circ / 4}
                            />
                            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="15" fontWeight="900" fill={accent}>{h.pct}</text>
                            <text x={cx} y={cy + 11} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8">%</text>
                          </svg>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${h.pct}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-3 text-[10px] font-semibold">
                          <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{h.done} done</span>
                          {h.overdue > 0 && <span className="flex items-center gap-1 text-amber-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{h.overdue} late</span>}
                          {h.blocked > 0 && <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />{h.blocked} blocked</span>}
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors ml-auto" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Row: My Tasks + Urgent Tasks ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          {/* Owner's personal tasks */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div className="h-0.5 w-full bg-gradient-to-r from-indigo-400 to-violet-500" />
            <CardHeader className="px-5 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CIcon icon={CheckSquare} bg="bg-indigo-100" cls="text-indigo-600" />
                {selectedMemberName ? `${selectedMemberName}'s Tasks` : 'My Tasks'}
                <span className="ml-auto text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-1">{myTasks.length} open</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              {myTasks.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
                  <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center"><CheckSquare className="h-7 w-7 opacity-30" /></div>
                  <div className="text-center">
                    <p className="text-sm font-medium">No open tasks{selectedMemberName ? ` for ${selectedMemberName}` : ' assigned to you'}</p>
                    <Link to="/tasks" className="text-xs text-primary hover:underline mt-1 inline-block">Go to Tasks →</Link>
                  </div>
                </div>
              ) : (
                <TaskList tasks={myTasks} isOverdueFn={isOverdue} isDueTodayFn={isDueToday} showAssignee={!!memberFilter} onTaskClick={(id) => navigate(`/tasks?taskId=${id}`)} />
              )}
            </CardContent>
          </Card>

          {/* Org-wide urgent tasks */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div className="h-0.5 w-full bg-gradient-to-r from-red-400 to-rose-500" />
            <CardHeader className="px-5 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CIcon icon={Flame} bg="bg-red-100" cls="text-red-600" />
                Urgent Org Tasks
                <span className="ml-auto text-[10px] font-bold bg-red-50 text-red-600 rounded-full px-2.5 py-1">{urgentTasks.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              {urgentTasks.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
                  <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center"><CheckSquare className="h-7 w-7 text-emerald-400" /></div>
                  <p className="text-sm font-semibold text-emerald-700">All clear!</p>
                </div>
              ) : (
                <TaskList tasks={urgentTasks} isOverdueFn={isOverdue} isDueTodayFn={isDueToday} showAssignee onTaskClick={(id) => navigate(`/tasks?taskId=${id}`)} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row: Team Workload + Resource Capacity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CIcon icon={TrendingUp} bg="bg-sky-100" cls="text-sky-600" />
                Team Workload
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">busiest first</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 pb-5 pt-3">
              <WorkloadChart filterQs={filterQs} />
            </CardContent>
          </Card>

          <ResourceCapacityCard />
        </div>

        {/* ── Row: Dept Comparison + Meeting Attendance ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CIcon icon={Building2} bg="bg-violet-100" cls="text-violet-600" />
                Department Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 pb-5 pt-3">
              {deptBar.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-muted-foreground gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center"><Building2 className="h-7 w-7 opacity-30" /></div>
                  <p className="text-sm font-medium">No departments yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={deptBar} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                    onClick={(d) => { if (d?.activePayload?.[0]) navigate(`/dashboard/${(d.activePayload[0].payload as { slug?: string }).slug ?? ''}`); }}
                  >
                    <defs>
                      <linearGradient id="dtGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.violet} /><stop offset="100%" stopColor={C.indigo} stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="dpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.teal} /><stop offset="100%" stopColor={C.sky} stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(99,102,241,0.04)', radius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="tasks" fill="url(#dtGrad)" radius={[6, 6, 0, 0]} name="Tasks" maxBarSize={28} />
                    <Bar dataKey="people" fill="url(#dpGrad)" radius={[6, 6, 0, 0]} name="People" maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Today's Meetings — join directly */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div className="h-0.5 w-full bg-gradient-to-r from-yellow-400 to-amber-500" />
            <CardHeader className="px-5 sm:px-6 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CIcon icon={Zap} bg="bg-yellow-100" cls="text-yellow-600" />
                Today's Meetings
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                  {(data?.todayStandups ?? []).length} scheduled
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 sm:px-6 pb-5 pt-3">
              {!(data?.todayStandups?.length) ? (
                <div className="flex flex-col items-center justify-center h-52 text-muted-foreground gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-yellow-50 flex items-center justify-center"><Zap className="h-7 w-7 text-yellow-300" /></div>
                  <p className="text-sm font-medium">No meetings today</p>
                  <Link to="/standup" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-4 py-2 text-xs font-semibold text-white hover:from-yellow-500 hover:to-amber-600 transition-all shadow-sm">
                    <Zap className="h-3.5 w-3.5" /> Schedule Meeting
                  </Link>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {(data.todayStandups as Array<{
                    id: string; status: string; scheduledAt: string;
                    department: { name: string };
                    _count: { cards: number };
                  }>).map((s) => {
                    const isLive = s.status === 'IN_PROGRESS';
                    const isDone = s.status === 'COMPLETED';
                    return (
                      <div key={s.id} className={cn(
                        'flex items-center gap-3 p-3 rounded-2xl border transition-all',
                        isLive ? 'border-amber-200 bg-amber-50/60' : isDone ? 'border-emerald-100 bg-emerald-50/40' : 'border-border/60 bg-white',
                      )}>
                        <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0',
                          isLive ? 'bg-amber-100' : isDone ? 'bg-emerald-100' : 'bg-blue-50',
                        )}>
                          <Zap className={cn('h-4 w-4', isLive ? 'text-amber-600' : isDone ? 'text-emerald-600' : 'text-blue-500')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{s.department.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(s.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            {' · '}{s._count.cards} participant{s._count.cards !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isLive && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Live
                            </span>
                          )}
                          {isDone && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">Done</span>
                          )}
                          {!isDone && (
                            <Link
                              to="/standup"
                              className={cn(
                                'inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
                                isLive
                                  ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:from-amber-500 hover:to-orange-600 shadow-sm'
                                  : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 shadow-sm',
                              )}
                            >
                              <Zap className="h-3 w-3" />
                              {isLive ? 'Join Now' : 'Join'}
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <Link to="/standup" className="block text-center text-xs text-primary hover:underline pt-1 font-medium">
                    View all meetings →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row: Blocker Types + Dept Activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CIcon icon={AlertTriangle} bg="bg-red-100" cls="text-red-600" />
                Blocker Types
                {blockerDonut.length > 0 && (
                  <Badge className="ml-auto rounded-full bg-red-100 text-red-700 border-0 text-xs font-semibold">
                    {blockerDonut.reduce((s: number, b: { value: number }) => s + b.value, 0)} blocked
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 sm:px-6 pb-5">
              {blockerDonut.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground">
                  <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center"><CheckSquare className="h-7 w-7 text-emerald-400" /></div>
                  <div className="text-center"><p className="text-sm font-semibold text-emerald-700">No blockers</p><p className="text-xs mt-0.5">Team is running smoothly!</p></div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                  <div className="w-full sm:w-[50%] shrink-0">
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie data={blockerDonut} cx="50%" cy="50%" innerRadius="46%" outerRadius="76%" paddingAngle={3} dataKey="value" strokeWidth={0}>
                          {blockerDonut.map((d: { color: string }, i: number) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<PieTip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full space-y-3">
                    {blockerDonut.map((b: { name: string; value: number; color: string }) => (
                      <div key={b.name} className="flex items-center gap-2.5 group/row cursor-pointer" onClick={() => navigate('/tasks?status=BLOCKED')}>
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                        <span className="text-xs flex-1 capitalize font-medium group-hover/row:text-foreground transition-colors" style={{ color: b.color }}>{b.name.toLowerCase()}</span>
                        <span className="text-sm font-bold tabular-nums">{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CIcon icon={TrendingUp} bg="bg-teal-100" cls="text-teal-600" />
                Department Activity
                <span className="ml-auto text-[10px] text-muted-foreground">share of org tasks</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-5 pb-4 pt-3">
              <div className="divide-y divide-border/50">
                {(() => {
                  const depts = data?.departments ?? [];
                  const deptTotal = depts.reduce((s: number, d: Department) => s + d._count.tasks, 0);
                  // Largest remainder method — ensures percentages always sum to 100
                  const raws = depts.map((d: Department) => deptTotal > 0 ? (d._count.tasks / deptTotal) * 100 : 0);
                  const floors = raws.map(Math.floor);
                  const remainder = 100 - floors.reduce((a: number, b: number) => a + b, 0);
                  const sorted = raws.map((r: number, i: number) => ({ i, frac: r - Math.floor(r) })).sort((a: {i:number,frac:number}, b: {i:number,frac:number}) => b.frac - a.frac);
                  const pcts = [...floors];
                  for (let k = 0; k < remainder; k++) pcts[sorted[k].i]++;
                  const gradients = ['from-indigo-400 to-violet-500', 'from-sky-400 to-blue-500', 'from-teal-400 to-emerald-500', 'from-amber-400 to-orange-500', 'from-rose-400 to-pink-500'];
                  return depts.map((dept: Department, i: number) => {
                  const taskPct = pcts[i];
                  const grad = gradients[i % gradients.length];
                  return (
                    <Link key={dept.id} to={dept.slug ? `/dashboard/${dept.slug}` : '/departments'}
                      className="flex items-center gap-3 sm:gap-4 py-3 px-2 sm:px-3 rounded-xl hover:bg-muted/30 transition-colors group"
                    >
                      <div className={cn('h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br shadow-sm', grad)}>
                        <Building2 className="h-4 w-4 text-white" />
                      </div>
                      <div className="w-24 sm:w-36 shrink-0">
                        <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{dept.name}</p>
                        <p className="text-[10px] text-muted-foreground">{dept._count.users} people</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-muted-foreground">{dept._count.tasks} tasks</span>
                          <span className="text-xs font-bold tabular-nums">{taskPct}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                          <div className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', grad)} style={{ width: `${taskPct}%` }} />
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 hidden sm:block" />
                    </Link>
                  );
                  });
                })()}
                {(data?.departments ?? []).length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-sm">No departments to display</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Repeated Blockers ── */}
        {(blockers?.repeatedBlockers?.length ?? 0) > 0 && (
          <Card className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50/60 to-rose-50/30 shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-xl bg-red-100 flex items-center justify-center"><Flame className="h-3.5 w-3.5 text-red-600" /></div>
                <span className="text-red-800">Repeated Blockers</span>
                <Badge className="rounded-full bg-red-600 text-white border-0 ml-1">3+ times</Badge>
                <Badge className="ml-auto rounded-full bg-red-100 text-red-700 border-0">{blockers.repeatedBlockers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 sm:px-6 pb-5 pt-3">
              <div className="space-y-2">
                {blockers.repeatedBlockers.map((task: {
                  id: string; title: string; blockerCount: number;
                  assignee?: { id: string; name: string }; department?: { name: string };
                }) => (
                  <div key={task.id} onClick={() => navigate(`/tasks?status=BLOCKED&taskId=${task.id}`)}
                    className="flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-white border border-red-100/80 hover:border-red-300 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-red-700 transition-colors">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {task.assignee && <span className="text-xs text-muted-foreground">{task.assignee.name}</span>}
                        {task.department && <span className="text-xs text-muted-foreground">· {task.department.name}</span>}
                      </div>
                    </div>
                    <Badge className="rounded-full bg-red-100 text-red-700 border-0 text-xs shrink-0 font-semibold">{task.blockerCount}× blocked</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Dept Overview cards ── */}
        {(data?.departments?.length ?? 0) > 0 && (
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CIcon icon={Building2} bg="bg-violet-100" cls="text-violet-600" />
                Department Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.departments.map((dept: Department, i: number) => {
                  const grads = [['from-indigo-500','to-violet-600'],['from-sky-500','to-blue-600'],['from-teal-500','to-emerald-600'],['from-amber-500','to-orange-600'],['from-rose-500','to-pink-600']];
                  const [f, t] = grads[i % grads.length];
                  return (
                    <Link key={dept.id} to={dept.slug ? `/dashboard/${dept.slug}` : '#'}
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

      {/* ── Active Users Dialog ── */}
      <Dialog open={activeUsersOpen} onOpenChange={setActiveUsersOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-xl bg-sky-100 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-sky-600" /></div>
              Active Today
              <Badge className="rounded-full bg-sky-100 text-sky-700 border-0 ml-1">{data?.activeUsers ?? 0}</Badge>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-3">Logged in within the last 24 hours</p>
          {!(data?.activeUsersList?.length) ? (
            <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
              <Users className="h-8 w-8 opacity-20" /><p className="text-sm">No one has logged in today yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {(data.activeUsersList as Array<{ id: string; name: string; role: string; lastLoginAt: string; department?: { name: string } }>).map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 hover:bg-muted/30 transition-colors">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-sky-50 text-sky-700 text-xs font-bold rounded-full">{getInitials(u.name)}</AvatarFallback>
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
    enabled: !!dept,
  });
  const { data: deptTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks-dept', dept?.id],
    queryFn: () => api.get(`/tasks?departmentId=${dept!.id}`).then((r) => r.data),
    enabled: !!dept?.id,
  });

  const deptTeams   = allTeams.filter((t) => t.department.slug === slug);
  const selectedTeam = deptTeams.find((t) => t.id === selectedTeamId) ?? null;
  const now = new Date();
  const isOverdueFn = (t: Task) => !!t.dueDate && !['DONE','CANCELLED'].includes(t.status) && new Date(t.dueDate) < now;
  const deptProjectProgress = deptTeams.map((pt, i) => {
    const ptTasks   = deptTasks.filter((t) => (t as unknown as { team?: { id: string } }).team?.id === pt.id);
    const ptDone    = ptTasks.filter((t) => t.status === 'DONE').length;
    const ptBlocked = ptTasks.filter((t) => t.status === 'BLOCKED').length;
    const ptOverdue = ptTasks.filter(isOverdueFn).length;
    const ptInProg  = ptTasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const ptPct     = ptTasks.length > 0 ? Math.round((ptDone / ptTasks.length) * 100) : 0;
    return { ...pt, i, ptTasks, ptDone, ptBlocked, ptOverdue, ptInProg, ptPct };
  });

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

            {/* Project-level KPI strip */}
            {(() => {
              const selTasks = deptTasks.filter((t) => (t as unknown as { team?: { id: string } }).team?.id === selectedTeam.id);
              const selDone    = selTasks.filter((t) => t.status === 'DONE').length;
              const selBlocked = selTasks.filter((t) => t.status === 'BLOCKED').length;
              const selOverdue = selTasks.filter(isOverdueFn).length;
              const selInProg  = selTasks.filter((t) => t.status === 'IN_PROGRESS').length;
              const selPct     = selTasks.length > 0 ? Math.round((selDone / selTasks.length) * 100) : 0;
              const r = 34; const cxy = 40; const circ = 2 * Math.PI * r;
              const dashArc = circ * (selPct / 100);
              const accent = selPct >= 70 ? '#059669' : selPct >= 40 ? '#d97706' : '#dc2626';
              return (
                <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-indigo-400 to-violet-600" />
                  <CardContent className="p-4">
                    <div className="flex items-center gap-5">
                      {/* Ring */}
                      <svg width="80" height="80" className="shrink-0" style={{ filter: `drop-shadow(0 3px 8px ${accent}35)` }}>
                        <circle cx={cxy} cy={cxy} r={r} fill={`${accent}0d`} />
                        <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                        <circle cx={cxy} cy={cxy} r={r} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={`${dashArc} ${circ}`} strokeDashoffset={circ / 4} />
                        <text x={cxy} y={cxy - 2} textAnchor="middle" fontSize="16" fontWeight="900" fill={accent}>{selPct}</text>
                        <text x={cxy} y={cxy + 12} textAnchor="middle" fontSize="9" fontWeight="600" fill="#94a3b8">%</text>
                      </svg>
                      {/* Stats */}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: 'Total',      value: selTasks.length, color: '#6366f1', bg: '#eef2ff' },
                          { label: 'Done',       value: selDone,         color: '#059669', bg: '#ecfdf5' },
                          { label: 'In Progress',value: selInProg,       color: '#0ea5e9', bg: '#f0f9ff' },
                          { label: 'Blocked',    value: selBlocked,      color: '#dc2626', bg: '#fef2f2' },
                        ].map(({ label, value, color, bg }) => (
                          <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: bg }}>
                            <p className="text-xl font-black tabular-nums leading-none" style={{ color }}>{value}</p>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {selOverdue > 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{selOverdue} overdue task{selOverdue > 1 ? 's' : ''} — action needed
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Member progress cards */}
            {(() => {
              const selTasks = deptTasks.filter((t) => (t as unknown as { team?: { id: string } }).team?.id === selectedTeam.id);
              const members = selectedTeam.members ?? [];
              if (members.length === 0) return null;
              const accentColors = ['#6366f1','#0ea5e9','#14b8a6','#f59e0b','#f43f5e','#8b5cf6','#10b981','#3b82f6'];
              return (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Member Progress</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {members.map((m: { user: { id: string; name: string; role: string } }, idx: number) => {
                      const mTasks   = selTasks.filter((t) => t.assignee?.id === m.user.id);
                      const mDone    = mTasks.filter((t) => t.status === 'DONE').length;
                      const mInProg  = mTasks.filter((t) => t.status === 'IN_PROGRESS').length;
                      const mBlocked = mTasks.filter((t) => t.status === 'BLOCKED').length;
                      const mOverdue = mTasks.filter(isOverdueFn).length;
                      const mPct     = mTasks.length > 0 ? Math.round((mDone / mTasks.length) * 100) : 0;
                      const accent   = accentColors[idx % accentColors.length];
                      const isManager = selectedTeam.manager?.id === m.user.id;
                      const r = 26; const cxy = 32; const circ = 2 * Math.PI * r;
                      const dashArc = circ * (mPct / 100);
                      const statusLabel = mTasks.length === 0 ? 'No tasks' : mPct >= 70 ? 'On Track' : mPct >= 40 ? 'At Risk' : 'Behind';
                      return (
                        <Link
                          key={m.user.id}
                          to={`/team/${m.user.id}/report`}
                          className="group block rounded-2xl border border-slate-100 bg-white hover:-translate-y-0.5 transition-all duration-200"
                          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                          onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.09), 0 0 0 1.5px ${accent}40`)}
                          onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
                        >
                          <div className="p-4">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-bold text-slate-800 truncate">{m.user.name}</p>
                                  {isManager && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 shrink-0">PM</span>}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{m.user.role.toLowerCase().replace(/_/g, ' ')}</p>
                              </div>
                              <svg width="64" height="64" className="shrink-0 -mt-1" style={{ filter: `drop-shadow(0 2px 6px ${accent}35)` }}>
                                <circle cx={cxy} cy={cxy} r={r} fill={`${accent}10`} />
                                <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
                                <circle cx={cxy} cy={cxy} r={r} fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round"
                                  strokeDasharray={`${dashArc} ${circ}`} strokeDashoffset={circ / 4} />
                                <text x={cxy} y={cxy - 2} textAnchor="middle" fontSize="13" fontWeight="900" fill={accent}>{mPct}</text>
                                <text x={cxy} y={cxy + 11} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8">%</text>
                              </svg>
                            </div>
                            {/* Status pill */}
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${accent}15`, color: accent }}>{statusLabel}</span>
                              <span className="text-[10px] text-slate-400">{mDone} / {mTasks.length} done</span>
                            </div>
                            {/* Progress bar */}
                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${mPct}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
                            </div>
                            {/* Stats */}
                            <div className="flex items-center gap-3 text-[10px] font-semibold">
                              {mInProg  > 0 && <span className="flex items-center gap-1 text-sky-600"><span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />{mInProg} active</span>}
                              {mOverdue > 0 && <span className="flex items-center gap-1 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />{mOverdue} late</span>}
                              {mBlocked > 0 && <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />{mBlocked} blocked</span>}
                              {mOverdue === 0 && mBlocked === 0 && mTasks.length > 0 && <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />On schedule</span>}
                              <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors ml-auto shrink-0" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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

            {/* Project Progress */}
            {deptProjectProgress.length > 0 && (
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-violet-500 to-purple-600" />
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={FolderKanban} bg="bg-indigo-100" cls="text-indigo-600" />
                    Project Progress
                    <span className="ml-auto text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-1">{deptProjectProgress.length} project{deptProjectProgress.length !== 1 ? 's' : ''}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {deptProjectProgress.map((proj) => {
                      const accentColors = ['#6366f1','#0ea5e9','#14b8a6','#f59e0b','#f43f5e','#8b5cf6'];
                      const accent = accentColors[proj.i % accentColors.length];
                      const isHealthy = proj.ptPct >= 70;
                      const isWarn    = proj.ptPct >= 40 && proj.ptPct < 70;
                      const statusLabel = proj.ptTasks.length === 0 ? 'No tasks' : isHealthy ? 'On Track' : isWarn ? 'At Risk' : 'Behind';
                      const r = 26; const cxy = 32; const circ = 2 * Math.PI * r;
                      const dash = circ * (proj.ptPct / 100);
                      return (
                        <Link
                          key={proj.id}
                          to={`/dashboard/${slug}?projectId=${proj.id}`}
                          className="group block rounded-2xl border border-slate-100 bg-white hover:-translate-y-0.5 transition-all duration-200"
                          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                          onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.09), 0 0 0 1.5px ${accent}40`)}
                          onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
                        >
                          <div className="p-4">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-800 truncate">{proj.name}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{proj.memberCount} member{proj.memberCount !== 1 ? 's' : ''}{proj.manager ? ` · ${proj.manager.name}` : ''}</p>
                              </div>
                              <svg width="64" height="64" className="shrink-0 -mt-1" style={{ filter: `drop-shadow(0 2px 6px ${accent}35)` }}>
                                <circle cx={cxy} cy={cxy} r={r} fill={`${accent}10`} />
                                <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
                                <circle cx={cxy} cy={cxy} r={r} fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round"
                                  strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4} />
                                <text x={cxy} y={cxy - 2} textAnchor="middle" fontSize="13" fontWeight="900" fill={accent}>{proj.ptPct}</text>
                                <text x={cxy} y={cxy + 11} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8">%</text>
                              </svg>
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${accent}15`, color: accent }}>{statusLabel}</span>
                              <span className="text-[10px] text-slate-400">{proj.ptDone} / {proj.ptTasks.length} done</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${proj.ptPct}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-semibold">
                              {proj.ptInProg > 0 && <span className="flex items-center gap-1 text-indigo-600"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />{proj.ptInProg} active</span>}
                              {proj.ptOverdue > 0 && <span className="flex items-center gap-1 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />{proj.ptOverdue} late</span>}
                              {proj.ptBlocked > 0 && <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />{proj.ptBlocked} blocked</span>}
                              {proj.ptOverdue === 0 && proj.ptBlocked === 0 && proj.ptTasks.length > 0 && <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />On schedule</span>}
                              <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors ml-auto shrink-0" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dept Head / Manager Dashboard ────────────────────────────────────────────
function DeptHeadHome() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const isManagerOrHead  = ['DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const isDeptHead       = user?.role === 'DEPARTMENT_HEAD';
  const departmentLabel  = user?.departmentName || departmentNameFromSlug(user?.departmentSlug);
  const designationLabel = user?.role?.toLowerCase().replace(/_/g, ' ') || '';

  const useAllDeptTeams = ['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(user?.role || '');
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', 'dh'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
  });
  const { data: myProjectTeams } = useQuery({
    queryKey: useAllDeptTeams ? ['teams'] : ['teams', 'managed'],
    queryFn: () => (useAllDeptTeams ? api.get('/teams') : api.get('/teams/managed')).then((r) => r.data),
  });
  const { data: accessibleDepts = [] } = useQuery<Array<{
    id: string; name: string; slug: string;
    head?: { id: string; name: string } | null;
    _count: { users: number; tasks: number };
  }>>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: isManagerOrHead,
  });

  const now        = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const isOverdue  = (t: Task) => !!t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) < now;
  const isDueToday = (t: Task) => !!t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) >= now && new Date(t.dueDate) <= todayEnd;

  const openTasks     = tasks.filter((t) => !['DONE', 'CANCELLED'].includes(t.status));
  const dueTodayTasks = tasks.filter(isDueToday);
  const overdueTasks  = tasks.filter(isOverdue);
  const blockedTasks  = tasks.filter((t) => t.status === 'BLOCKED');
  const doneTasks     = tasks.filter((t) => t.status === 'DONE');
  const myOpenTasks   = openTasks.filter((t) => t.assignee?.id === user?.id);
  const teamOpenTasks = openTasks.filter((t) => t.assignee?.id !== user?.id);
  const urgentTasks   = openTasks.filter((t) => isOverdue(t) || isDueToday(t) || ['CRITICAL', 'HIGH'].includes(t.priority));

  type ProjTeam = { id: string; name: string; description?: string; memberCount: number; manager?: { id: string; name: string }; department?: { name: string; slug?: string }; members?: Array<{ user: { id: string; name: string; role: string } }> };
  const projectTeams = (myProjectTeams as ProjTeam[] | undefined) ?? [];

  // Compute per-project progress from existing tasks (tasks include team: { id, name })
  const projectProgress = projectTeams.map((pt) => {
    const ptTasks = tasks.filter((t) => (t as unknown as { team?: { id: string } }).team?.id === pt.id);
    const ptDone     = ptTasks.filter((t) => t.status === 'DONE').length;
    const ptBlocked  = ptTasks.filter((t) => t.status === 'BLOCKED').length;
    const ptOverdue  = ptTasks.filter(isOverdue).length;
    const ptInProg   = ptTasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const ptPct      = ptTasks.length > 0 ? Math.round((ptDone / ptTasks.length) * 100) : 0;
    return { ...pt, ptTasks, ptDone, ptBlocked, ptOverdue, ptInProg, ptPct };
  });

  const taskDoneRate = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  const [searchParams] = useSearchParams();
  const selectedProjectId = searchParams.get('projectId');
  const selectedProject = selectedProjectId ? (projectProgress.find(p => p.id === selectedProjectId) ?? null) : null;

  if (selectedProject) {
    const selTasks   = tasks.filter((t) => (t as unknown as { team?: { id: string } }).team?.id === selectedProject.id);
    const selDone    = selTasks.filter((t) => t.status === 'DONE').length;
    const selBlocked = selTasks.filter((t) => t.status === 'BLOCKED').length;
    const selOverdue = selTasks.filter(isOverdue).length;
    const selInProg  = selTasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const selPct     = selTasks.length > 0 ? Math.round((selDone / selTasks.length) * 100) : 0;
    const r = 34; const cxy = 40; const circ = 2 * Math.PI * r;
    const dashArc = circ * (selPct / 100);
    const accent = selPct >= 70 ? '#059669' : selPct >= 40 ? '#d97706' : '#dc2626';
    const members = selectedProject.members ?? [];
    const accentColors = ['#6366f1','#0ea5e9','#14b8a6','#f59e0b','#f43f5e','#8b5cf6','#10b981','#3b82f6'];

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
        <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
          {/* Back + project header */}
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2.5 py-1.5 hover:bg-slate-100"
            >
              ← Back
            </Link>
            <div className="flex items-center gap-3 flex-1">
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                <FolderKanban className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{selectedProject.name}</h2>
                {selectedProject.description && <p className="text-sm text-muted-foreground">{selectedProject.description}</p>}
              </div>
            </div>
          </div>

          {/* Project KPI strip */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-indigo-400 to-violet-600" />
            <CardContent className="p-4">
              <div className="flex items-center gap-5">
                <svg width="80" height="80" className="shrink-0" style={{ filter: `drop-shadow(0 3px 8px ${accent}35)` }}>
                  <circle cx={cxy} cy={cxy} r={r} fill={`${accent}0d`} />
                  <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                  <circle cx={cxy} cy={cxy} r={r} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${dashArc} ${circ}`} strokeDashoffset={circ / 4} />
                  <text x={cxy} y={cxy - 2} textAnchor="middle" fontSize="16" fontWeight="900" fill={accent}>{selPct}</text>
                  <text x={cxy} y={cxy + 12} textAnchor="middle" fontSize="9" fontWeight="600" fill="#94a3b8">%</text>
                </svg>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Total',       value: selTasks.length, color: '#6366f1', bg: '#eef2ff' },
                    { label: 'Done',        value: selDone,         color: '#059669', bg: '#ecfdf5' },
                    { label: 'In Progress', value: selInProg,       color: '#0ea5e9', bg: '#f0f9ff' },
                    { label: 'Blocked',     value: selBlocked,      color: '#dc2626', bg: '#fef2f2' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: bg }}>
                      <p className="text-xl font-black tabular-nums leading-none" style={{ color }}>{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 font-medium">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {selOverdue > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{selOverdue} overdue task{selOverdue > 1 ? 's' : ''} — action needed
                </div>
              )}
            </CardContent>
          </Card>

          {/* Member progress cards */}
          {members.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Member Progress</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {members.map((m, idx) => {
                  const mTasks   = selTasks.filter((t) => t.assignee?.id === m.user.id);
                  const mDone    = mTasks.filter((t) => t.status === 'DONE').length;
                  const mInProg  = mTasks.filter((t) => t.status === 'IN_PROGRESS').length;
                  const mBlocked = mTasks.filter((t) => t.status === 'BLOCKED').length;
                  const mOverdue = mTasks.filter(isOverdue).length;
                  const mPct     = mTasks.length > 0 ? Math.round((mDone / mTasks.length) * 100) : 0;
                  const mAccent  = accentColors[idx % accentColors.length];
                  const isManager = selectedProject.manager?.id === m.user.id;
                  const mr = 26; const mcxy = 32; const mcirc = 2 * Math.PI * mr;
                  const mDash = mcirc * (mPct / 100);
                  const mStatusLabel = mTasks.length === 0 ? 'No tasks' : mPct >= 70 ? 'On Track' : mPct >= 40 ? 'At Risk' : 'Behind';
                  return (
                    <Link
                      key={m.user.id}
                      to={`/team/${m.user.id}/report`}
                      className="group block rounded-2xl border border-slate-100 bg-white hover:-translate-y-0.5 transition-all duration-200"
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.09), 0 0 0 1.5px ${mAccent}40`)}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-bold text-slate-800 truncate">{m.user.name}</p>
                              {isManager && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 shrink-0">PM</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{m.user.role.toLowerCase().replace(/_/g, ' ')}</p>
                          </div>
                          <svg width="64" height="64" className="shrink-0 -mt-1" style={{ filter: `drop-shadow(0 2px 6px ${mAccent}35)` }}>
                            <circle cx={mcxy} cy={mcxy} r={mr} fill={`${mAccent}10`} />
                            <circle cx={mcxy} cy={mcxy} r={mr} fill="none" stroke="#e2e8f0" strokeWidth="5" />
                            <circle cx={mcxy} cy={mcxy} r={mr} fill="none" stroke={mAccent} strokeWidth="5" strokeLinecap="round"
                              strokeDasharray={`${mDash} ${mcirc}`} strokeDashoffset={mcirc / 4} />
                            <text x={mcxy} y={mcxy - 2} textAnchor="middle" fontSize="13" fontWeight="900" fill={mAccent}>{mPct}</text>
                            <text x={mcxy} y={mcxy + 11} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8">%</text>
                          </svg>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${mAccent}15`, color: mAccent }}>{mStatusLabel}</span>
                          <span className="text-[10px] text-slate-400">{mDone} / {mTasks.length} done</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${mPct}%`, background: `linear-gradient(90deg, ${mAccent}99, ${mAccent})` }} />
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-semibold">
                          {mInProg  > 0 && <span className="flex items-center gap-1 text-sky-600"><span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />{mInProg} active</span>}
                          {mOverdue > 0 && <span className="flex items-center gap-1 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />{mOverdue} late</span>}
                          {mBlocked > 0 && <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />{mBlocked} blocked</span>}
                          {mOverdue === 0 && mBlocked === 0 && mTasks.length > 0 && <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />On schedule</span>}
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors ml-auto shrink-0" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200/60 shrink-0">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
                {greeting()}, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {departmentLabel && (
                <p className="text-xs font-semibold text-indigo-600 mt-0.5 capitalize">
                  {designationLabel} · {departmentLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/tasks" className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-2 text-xs font-semibold hover:border-indigo-300 hover:shadow-sm transition-all">
              <CheckSquare className="h-3.5 w-3.5 text-indigo-500" /> Tasks
            </Link>
            <Link to="/standup" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 shadow-sm shadow-indigo-200 transition-all">
              <Zap className="h-3.5 w-3.5" /> Start Meeting
            </Link>
          </div>
        </div>

        {/* ── 4 KPI cards ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <GradientKpi label="Open Tasks"  value={openTasks.length}     sub={`${taskDoneRate}% completion rate`} icon={CheckSquare}   from="from-indigo-500" to="to-violet-600" shadow="shadow-indigo-200" onClick={() => navigate('/tasks')} />
          <GradientKpi label="Due Today"   value={dueTodayTasks.length} sub={dueTodayTasks.length === 0 ? 'nothing due' : 'need completion'} icon={Calendar} from={dueTodayTasks.length === 0 ? 'from-slate-400' : 'from-orange-500'} to={dueTodayTasks.length === 0 ? 'to-slate-500' : 'to-amber-500'} shadow={dueTodayTasks.length === 0 ? 'shadow-slate-200' : 'shadow-orange-200'} onClick={() => navigate('/tasks?status=due_today')} />
          <GradientKpi label="Overdue"     value={overdueTasks.length}  sub="past due date"          icon={Clock}         from={overdueTasks.length === 0 ? 'from-slate-400' : 'from-red-500'}    to={overdueTasks.length === 0 ? 'to-slate-500' : 'to-rose-600'}   shadow={overdueTasks.length === 0 ? 'shadow-slate-200' : 'shadow-red-200'}    onClick={() => navigate('/tasks?status=overdue')} />
          <GradientKpi label="Blocked"     value={blockedTasks.length}  sub="need resolution"        icon={AlertTriangle} from={blockedTasks.length === 0 ? 'from-slate-400' : 'from-amber-500'}  to={blockedTasks.length === 0 ? 'to-slate-500' : 'to-orange-600'} shadow={blockedTasks.length === 0 ? 'shadow-slate-200' : 'shadow-amber-200'} onClick={() => navigate('/tasks?status=BLOCKED')} />
        </div>

        {/* ── Overdue alert ── */}
        {overdueTasks.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-red-100">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-red-600 shrink-0" />
                <span className="font-bold text-sm text-red-800">{overdueTasks.length} Overdue Task{overdueTasks.length > 1 ? 's' : ''} — Action Required</span>
              </div>
              <Link to="/tasks?status=overdue" className="text-xs font-semibold text-red-600 hover:underline">View all →</Link>
            </div>
            <div className="divide-y divide-red-100/60">
              {overdueTasks.slice(0, 3).map((task) => {
                const dueDay = new Date(task.dueDate!); dueDay.setHours(0, 0, 0, 0);
                const days = Math.round((todayStart.getTime() - dueDay.getTime()) / 86400000);
                return (
                  <div key={task.id} role="button" tabIndex={0}
                    onClick={() => navigate(`/tasks?taskId=${task.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/tasks?taskId=${task.id}`); }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-100/40 transition-colors cursor-pointer"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                    <p className="text-sm font-medium text-red-900 flex-1 truncate">{task.title}</p>
                    {task.assignee && (
                      <Link to={`/team/${task.assignee.id}/report`} onClick={(e) => e.stopPropagation()} className="text-xs text-primary font-semibold hover:underline shrink-0">{task.assignee.name.split(' ')[0]}</Link>
                    )}
                    <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full shrink-0">
                      {days <= 0 ? 'today' : `${days}d late`}
                    </span>
                  </div>
                );
              })}
              {overdueTasks.length > 3 && (
                <div className="px-4 py-2 text-center">
                  <Link to="/tasks?status=overdue" className="text-xs text-red-600 font-semibold hover:underline">+{overdueTasks.length - 3} more</Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── My Departments ── */}
        {isManagerOrHead && accessibleDepts.length > 0 && (
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-violet-400 to-indigo-500" />
            <CardHeader className="px-5 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CIcon icon={Building2} bg="bg-violet-100" cls="text-violet-600" />
                My Departments
                <span className="ml-auto text-[10px] font-bold bg-violet-50 text-violet-600 rounded-full px-2.5 py-1">{accessibleDepts.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {accessibleDepts.map((dept) => (
                  <Link
                    key={dept.id}
                    to={`/departments/${dept.slug}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50/30 transition-all group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200/60">
                      <Building2 className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{dept.name}</p>
                      <p className="text-[10px] text-muted-foreground">{dept._count.users} members · {dept._count.tasks} tasks</p>
                      <p className="text-[10px] text-violet-500 font-medium truncate mt-0.5">{user?.name}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-violet-500 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Projects strip ── */}
        {projectProgress.length > 0 && (
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-violet-500 to-purple-600" />
            <CardHeader className="px-5 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CIcon icon={FolderKanban} bg="bg-indigo-100" cls="text-indigo-600" />
                Project Progress
                <span className="ml-auto text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-1">{projectProgress.length} project{projectProgress.length !== 1 ? 's' : ''}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projectProgress.map((proj, i) => {
                  const accentColors = ['#6366f1','#0ea5e9','#14b8a6','#f59e0b','#f43f5e','#8b5cf6'];
                  const accent = accentColors[i % accentColors.length];
                  const isHealthy = proj.ptPct >= 70;
                  const isWarn    = proj.ptPct >= 40 && proj.ptPct < 70;
                  const statusLabel = proj.ptTasks.length === 0 ? 'No tasks' : isHealthy ? 'On Track' : isWarn ? 'At Risk' : 'Behind';
                  const r = 26; const cxy = 32; const circ = 2 * Math.PI * r;
                  const dash = circ * (proj.ptPct / 100);
                  return (
                    <Link
                      key={proj.id}
                      to={`/dashboard?projectId=${proj.id}`}
                      className="group block rounded-2xl border border-slate-100 bg-white hover:-translate-y-0.5 transition-all duration-200"
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.09), 0 0 0 1.5px ${accent}40`)}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
                    >
                      <div className="p-4">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 truncate leading-tight">{proj.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {proj.memberCount} member{proj.memberCount !== 1 ? 's' : ''}
                              {proj.department ? ` · ${proj.department.name}` : ''}
                            </p>
                          </div>
                          {/* Arc ring */}
                          <svg width="64" height="64" className="shrink-0 -mt-1" style={{ filter: `drop-shadow(0 2px 6px ${accent}35)` }}>
                            <circle cx={cxy} cy={cxy} r={r} fill={`${accent}10`} />
                            <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
                            <circle cx={cxy} cy={cxy} r={r} fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round"
                              strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4} />
                            <text x={cxy} y={cxy - 2} textAnchor="middle" fontSize="13" fontWeight="900" fill={accent}>{proj.ptPct}</text>
                            <text x={cxy} y={cxy + 11} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8">%</text>
                          </svg>
                        </div>

                        {/* Status pill + task count */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${accent}15`, color: accent }}>{statusLabel}</span>
                          <span className="text-[10px] text-slate-400">{proj.ptDone} / {proj.ptTasks.length} tasks done</span>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${proj.ptPct}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
                        </div>

                        {/* Mini stats */}
                        <div className="flex items-center gap-3 text-[10px] font-semibold">
                          {proj.ptInProg > 0 && <span className="flex items-center gap-1 text-indigo-600"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />{proj.ptInProg} in progress</span>}
                          {proj.ptOverdue > 0 && <span className="flex items-center gap-1 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />{proj.ptOverdue} late</span>}
                          {proj.ptBlocked > 0 && <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />{proj.ptBlocked} blocked</span>}
                          {proj.ptOverdue === 0 && proj.ptBlocked === 0 && proj.ptTasks.length > 0 && (
                            <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />On schedule</span>
                          )}
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors ml-auto shrink-0" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Main 2-col grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: My Tasks + Team Tasks */}
          <div className="lg:col-span-2 space-y-4">

            {/* My Tasks */}
            <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-indigo-400 to-violet-500" />
              <CardHeader className="px-5 pt-4 pb-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CIcon icon={CheckSquare} bg="bg-indigo-100" cls="text-indigo-600" />
                  My Tasks
                  <span className="ml-auto text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-1">{myOpenTasks.length} open</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                {isLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <SkeletonPulse key={i} className="h-10 rounded-xl" />)}</div>
                ) : myOpenTasks.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
                    <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center"><CheckSquare className="h-7 w-7 opacity-30" /></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">All clear — no tasks assigned to you</p>
                      <Link to="/tasks" className="text-xs text-primary hover:underline mt-1 inline-block">Go to Tasks →</Link>
                    </div>
                  </div>
                ) : (
                  <TaskList tasks={myOpenTasks} isOverdueFn={isOverdue} isDueTodayFn={isDueToday} showAssignee={false} onTaskClick={(id) => navigate(`/tasks?taskId=${id}`)} />
                )}
              </CardContent>
            </Card>

            {/* Team / Dept Tasks */}
            {isManagerOrHead && (
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-sky-400 to-blue-500" />
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={Users} bg="bg-sky-100" cls="text-sky-600" />
                    {isDeptHead ? 'Department Tasks' : 'Team Tasks'}
                    <span className="ml-auto text-[10px] font-bold bg-sky-50 text-sky-600 rounded-full px-2.5 py-1">{teamOpenTasks.length} open</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3">
                  {teamOpenTasks.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                      <div className="h-10 w-10 rounded-2xl bg-sky-50 flex items-center justify-center"><Users className="h-5 w-5 text-sky-300" /></div>
                      <p className="text-sm font-medium">No open tasks for your {isDeptHead ? 'department' : 'team'}</p>
                    </div>
                  ) : (
                    <TaskList tasks={teamOpenTasks} isOverdueFn={isOverdue} isDueTodayFn={isDueToday} showAssignee onTaskClick={(id) => navigate(`/tasks?taskId=${id}`)} />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Urgent / Due Today (if any) */}
            {urgentTasks.length > 0 && (
              <Card className="rounded-2xl border border-amber-200/70 bg-amber-50/30 shadow-sm overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={Flame} bg="bg-amber-100" cls="text-amber-600" />
                    Needs Attention
                    <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">{urgentTasks.length}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3">
                  <TaskList tasks={urgentTasks.slice(0, 6)} isOverdueFn={isOverdue} isDueTodayFn={isDueToday} showAssignee onTaskClick={(id) => navigate(`/tasks?taskId=${id}`)} />
                  {urgentTasks.length > 6 && (
                    <Link to="/tasks?status=overdue" className="block text-center text-xs text-amber-700 font-semibold hover:underline mt-2">+{urgentTasks.length - 6} more →</Link>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">

            {/* Team stat tiles */}
            {isManagerOrHead && (
              <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-teal-400 to-emerald-500" />
                <CardHeader className="px-5 pt-4 pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CIcon icon={TrendingUp} bg="bg-teal-100" cls="text-teal-600" />
                    {isDeptHead ? 'Department Overview' : 'Team Overview'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3">
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: 'Open',    value: openTasks.length,    color: '#6366f1', bg: '#eef2ff', href: '/tasks' },
                      { label: 'Done',    value: doneTasks.length,    color: '#059669', bg: '#ecfdf5', href: '/tasks?status=DONE' },
                      { label: 'Overdue', value: overdueTasks.length, color: '#dc2626', bg: '#fef2f2', href: '/tasks?status=overdue' },
                      { label: 'Blocked', value: blockedTasks.length, color: '#d97706', bg: '#fffbeb', href: '/tasks?status=BLOCKED' },
                    ].map(({ label, value, color, bg, href }) => (
                      <Link key={label} to={href}
                        className="block rounded-xl p-3 text-center hover:-translate-y-0.5 hover:shadow-md transition-all"
                        style={{ background: bg }}
                      >
                        <p className="text-2xl font-black tabular-nums leading-none" style={{ color }}>{value}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-semibold">{label}</p>
                      </Link>
                    ))}
                  </div>
                  {/* Completion bar */}
                  <div className="pt-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                      <span>Completion rate</span>
                      <span className="font-bold text-emerald-600">{taskDoneRate}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700" style={{ width: `${taskDoneRate}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resource Capacity */}
            <ResourceCapacityCard />

            {/* Blockers */}
            <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
              <div className={cn('h-1 w-full', blockedTasks.length > 0 ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500')} />
              <CardHeader className="px-5 pt-4 pb-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CIcon icon={AlertTriangle} bg="bg-red-100" cls="text-red-600" />
                  {isManagerOrHead ? 'Team Blockers' : 'My Blockers'}
                  <span className={cn('ml-auto text-[10px] font-bold rounded-full px-2.5 py-1', blockedTasks.length > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-600')}>
                    {blockedTasks.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3">
                {blockedTasks.length === 0 ? (
                  <div className="flex flex-col items-center py-6 gap-2">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center"><CheckSquare className="h-5 w-5 text-emerald-400" /></div>
                    <p className="text-sm font-semibold text-emerald-700">No blockers!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blockedTasks.slice(0, 5).map((task) => (
                      <div key={task.id} onClick={() => navigate(`/tasks?taskId=${task.id}`)}
                        className="p-3 rounded-xl bg-red-50/60 border border-red-100 hover:border-red-200 hover:bg-red-50 transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-red-900 truncate flex-1 group-hover:text-red-700">{task.title}</p>
                          {task.assignee && (
                            <Link to={`/team/${task.assignee.id}/report`} onClick={(e) => e.stopPropagation()} className="text-[10px] text-primary shrink-0 hover:underline font-semibold">
                              {task.assignee.name.split(' ')[0]}
                            </Link>
                          )}
                        </div>
                        {task.blockerType && (
                          <p className="text-[10px] text-red-400 mt-1 capitalize">{task.blockerType.toLowerCase().replace(/_/g, ' ')}</p>
                        )}
                      </div>
                    ))}
                    {blockedTasks.length > 5 && (
                      <Link to="/tasks?status=BLOCKED" className="block text-center text-xs text-primary hover:underline pt-1 font-medium">View all {blockedTasks.length} →</Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { slug } = useParams<{ slug?: string }>();
  const { user } = useAuthStore();
  const isCeo    = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');

  if (slug) return <DepartmentDashboard slug={slug} />;
  if (isCeo) return <OwnerHome />;
  return <DeptHeadHome />;
}
