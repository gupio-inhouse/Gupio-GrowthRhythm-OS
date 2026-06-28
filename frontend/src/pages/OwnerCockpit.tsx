import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  AlertTriangle, CheckSquare, Users, Building2, TrendingUp, Zap,
  Target, ExternalLink, ChevronRight, Activity, ArrowUpRight,
  Shield, Flame,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, getInitials, formatRelative } from '@/lib/utils';
import api from '@/api/client';

// ── Palette ──────────────────────────────────────────────────────────────────
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

// ── Shared tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-white/95 backdrop-blur-sm shadow-2xl px-4 py-3 min-w-[130px]">
      {label && (
        <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">{label}</p>
      )}
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

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-2xl bg-gradient-to-r from-muted via-muted/60 to-muted animate-pulse', className)} />;
}

// ── SVG Gauge arc ─────────────────────────────────────────────────────────────
function GaugeArc({ percent, color }: { percent: number; color: string }) {
  const SIZE   = 200;
  const CX     = SIZE / 2;
  const CY     = SIZE / 2 + 10;
  const R      = 78;
  const SW     = 16;           // stroke width
  const START  = 135;          // degrees (clock-wise from 12 o'clock = 0°; SVG x-axis = 90°)
  const SWEEP  = 270;          // total arc length in degrees

  function toXY(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  }

  function arc(startDeg: number, endDeg: number) {
    const s = toXY(startDeg);
    const e = toXY(endDeg);
    const diff = ((endDeg - startDeg) % 360 + 360) % 360;
    const large = diff > 180 ? 1 : 0;
    return `M ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)}`;
  }

  const bgEnd    = START + SWEEP;
  const fillEnd  = START + (SWEEP * Math.min(Math.max(percent, 0), 100)) / 100;
  const safeEnd  = percent > 0 ? fillEnd : START + 0.01; // avoid zero-length arc

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" style={{ maxHeight: 190 }}>
      {/* Track */}
      <path d={arc(START, bgEnd)}   fill="none" stroke="#f1f5f9"  strokeWidth={SW} strokeLinecap="round" />
      {/* Fill */}
      <path d={arc(START, safeEnd)} fill="none" stroke={color}    strokeWidth={SW} strokeLinecap="round" />
      {/* Glow dot at tip */}
      {percent > 2 && (() => {
        const tip = toXY(safeEnd);
        return <circle cx={tip.x} cy={tip.y} r={SW / 2 + 1} fill={color} opacity={0.35} />;
      })()}
      {/* Centre % */}
      <text x={CX} y={CY - 8}  textAnchor="middle" fontSize={38} fontWeight={900} fill={color} fontFamily="inherit">
        {percent}
      </text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize={13} fontWeight={600} fill={color} opacity={0.7} fontFamily="inherit">
        %
      </text>
      <text x={CX} y={CY + 32} textAnchor="middle" fontSize={10} fill="#94a3b8" fontFamily="inherit">
        completion rate
      </text>
    </svg>
  );
}

// ── Workload chart ────────────────────────────────────────────────────────────
function WorkloadChart() {
  const navigate = useNavigate();
  const { data: workload = [], isLoading } = useQuery<Array<{
    id: string; name: string; email: string; role: string;
    departmentName: string | null; activeTaskCount: number;
  }>>({
    queryKey: ['users-workload'],
    queryFn: () => api.get('/users/workload').then((r) => r.data),
  });

  const chartData = [...workload]
    .sort((a, b) => b.activeTaskCount - a.activeTaskCount)
    .slice(0, 8)
    .map((m) => ({ name: m.name.split(' ')[0], tasks: m.activeTaskCount, id: m.id }));

  if (isLoading) {
    return (
      <div className="space-y-2.5 pt-2">
        {[90, 78, 66, 54, 42].map((w, i) => (
          <div
            key={i}
            className="h-7 rounded-xl bg-gradient-to-r from-muted via-muted/60 to-muted animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="flex flex-col items-center justify-center h-44 text-muted-foreground gap-3">
        <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center">
          <Users className="h-7 w-7 opacity-30" />
        </div>
        <p className="text-sm font-medium">No workload data yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
        onClick={(d) => {
          if (d?.activePayload?.[0])
            navigate(`/team/${(d.activePayload[0].payload as { id: string }).id}/report`);
        }}
      >
        <defs>
          <linearGradient id="wlGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.indigo} />
            <stop offset="100%" stopColor={C.violet} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
          width={58}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(99,102,241,0.04)', radius: 8 }} />
        <Bar
          dataKey="tasks"
          fill="url(#wlGrad)"
          radius={[0, 8, 8, 0]}
          name="Active Tasks"
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Card header icon ──────────────────────────────────────────────────────────
function CardIcon({
  icon: Icon, bg, iconCls,
}: { icon: React.ElementType; bg: string; iconCls: string }) {
  return (
    <div className={cn('h-7 w-7 rounded-xl flex items-center justify-center shrink-0', bg)}>
      <Icon className={cn('h-3.5 w-3.5', iconCls)} />
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Department = {
  id: string; name: string; slug?: string;
  _count: { tasks: number; users: number };
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OwnerCockpit() {
  const navigate = useNavigate();
  const [activeUsersOpen, setActiveUsersOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cockpit'],
    queryFn: () => api.get('/owner/cockpit').then((r) => r.data),
  });
  const { data: weekly } = useQuery({
    queryKey: ['cockpit-weekly'],
    queryFn: () => api.get('/owner/cockpit/weekly-summary').then((r) => r.data),
  });
  const { data: blockers } = useQuery({
    queryKey: ['cockpit-blockers'],
    queryFn: () => api.get('/owner/cockpit/blockers').then((r) => r.data),
  });

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-80" />)}
        </div>
      </div>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const tasks      = data?.tasks ?? { total: 0, done: 0, overdue: 0, blocked: 0 };
  const taskHealth = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;
  const activeAmt  = Math.max(tasks.total - tasks.done - tasks.blocked - tasks.overdue, 0);
  const hasData    = (data?.departments?.length ?? 0) > 0 || (data?.totalUsers ?? 0) > 0;

  const healthColor = taskHealth >= 70 ? C.emerald : taskHealth >= 40 ? C.amber : C.red;

  const taskDonut = [
    { name: 'Done',    value: tasks.done,    color: C.emerald },
    { name: 'Active',  value: activeAmt,      color: C.indigo  },
    { name: 'Overdue', value: tasks.overdue,  color: C.amber   },
    { name: 'Blocked', value: tasks.blocked,  color: C.red     },
  ].filter((d) => d.value > 0);

  const deptBar = (data?.departments ?? []).map((d: Department) => ({
    name: d.name.length > 11 ? d.name.slice(0, 11) + '…' : d.name,
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

  // ── KPI definitions ───────────────────────────────────────────────────────
  type KpiDef = {
    label: string; value: string | number; sub: string;
    icon: React.ElementType; from: string; to: string;
    shadow: string; onClick: () => void;
  };

  const kpis: KpiDef[] = [
    {
      label: 'Active Members',
      value: data?.activeUsers ?? 0,
      sub: `of ${data?.totalUsers ?? 0} total`,
      icon: Users,
      from: 'from-sky-500', to: 'to-blue-600',
      shadow: 'shadow-blue-200',
      onClick: () => setActiveUsersOpen(true),
    },
    {
      label: 'Task Health',
      value: `${taskHealth}%`,
      sub: `${tasks.done} of ${tasks.total} done`,
      icon: Target,
      from: taskHealth >= 70 ? 'from-emerald-500' : taskHealth >= 40 ? 'from-amber-400' : 'from-red-500',
      to:   taskHealth >= 70 ? 'to-green-600'    : taskHealth >= 40 ? 'to-orange-500'  : 'to-rose-600',
      shadow: taskHealth >= 70 ? 'shadow-green-200' : taskHealth >= 40 ? 'shadow-amber-200' : 'shadow-red-200',
      onClick: () => navigate('/tasks'),
    },
    {
      label: 'Departments',
      value: data?.departments?.length ?? 0,
      sub: 'active',
      icon: Building2,
      from: 'from-violet-500', to: 'to-purple-600',
      shadow: 'shadow-violet-200',
      onClick: () => navigate('/departments'),
    },
    {
      label: 'Blockers',
      value: tasks.blocked,
      sub: tasks.blocked === 0 ? 'all clear!' : 'need resolution',
      icon: tasks.blocked === 0 ? Shield : Flame,
      from: tasks.blocked === 0 ? 'from-teal-400' : 'from-red-500',
      to:   tasks.blocked === 0 ? 'to-emerald-500' : 'to-rose-600',
      shadow: tasks.blocked === 0 ? 'shadow-teal-200' : 'shadow-red-200',
      onClick: () => navigate('/tasks?status=BLOCKED'),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">

        {/* ══ Header ════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Activity className="h-5.5 w-5.5 text-white h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Owner Cockpit</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Company-wide execution intelligence</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-xl border-border/60 hover:border-primary/40 text-xs sm:text-sm">
              <Link to="/departments?create=department">Add Department</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 border-0 shadow-md shadow-indigo-200 text-xs sm:text-sm">
              <Link to="/team">Manage Team</Link>
            </Button>
          </div>
        </div>

        {/* ── Empty state ── */}
        {!hasData && (
          <Card className="border-dashed border-2 bg-gradient-to-br from-indigo-50/50 to-violet-50/30 rounded-3xl">
            <CardContent className="p-6 sm:p-8 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <Activity className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-base">Your workspace is ready for setup</p>
                <div className="text-sm text-muted-foreground space-y-0.5 mt-1.5">
                  <p>1. Add a department so work has a clear home.</p>
                  <p>2. Invite managers or team members.</p>
                  <p>3. Assign tasks to start tracking execution.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="rounded-xl">
                  <Link to="/departments?create=department">Add Department</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="rounded-xl">
                  <Link to="/team">Invite People</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══ KPI Cards ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {kpis.map(({ label, value, sub, icon: Icon, from, to, shadow, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
            >
              <Card className={cn(
                'relative overflow-hidden rounded-2xl border-0 transition-all duration-300',
                'group-hover:scale-[1.02] group-hover:shadow-xl',
                'bg-gradient-to-br shadow-lg',
                shadow, from, to,
              )}>
                {/* Background shimmer */}
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />

                <CardContent className="relative p-4 sm:p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
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

        {/* ══ Weekly strip ═══════════════════════════════════════════════════ */}
        {weekly && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Completed this week', value: weekly.completedThisWeek, icon: CheckSquare, from: 'from-emerald-500', to: 'to-green-400', to2: '/tasks?status=DONE' },
              { label: 'New blockers',         value: weekly.newBlockers,        icon: AlertTriangle, from: 'from-red-500',    to: 'to-rose-400',  to2: '/tasks?status=BLOCKED' },
              { label: 'Standups held',        value: weekly.standupCount,       icon: Zap,          from: 'from-blue-500',   to: 'to-indigo-400',to2: '/standup' },
            ].map(({ label, value, icon: Icon, from, to, to2 }) => (
              <Link key={label} to={to2} className="group">
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

        {/* ══ Row 1: Health Gauge + Task Donut ══════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          {/* ── Task Health — full analytical card ── */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
            {/* Coloured top strip */}
            <div
              className="h-1 w-full"
              style={{ background: `linear-gradient(90deg, ${healthColor}, ${healthColor}88)` }}
            />
            <CardHeader className="px-5 sm:px-6 pt-4 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CardIcon icon={Target} bg="bg-emerald-100" iconCls="text-emerald-600" />
                Task Health Score
                <span
                  className="ml-auto text-[11px] font-bold rounded-full px-3 py-1"
                  style={{ background: `${healthColor}18`, color: healthColor }}
                >
                  {taskHealth >= 70 ? '✓ Good' : taskHealth >= 40 ? '⚠ Needs Attention' : '✕ Critical'}
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="px-5 sm:px-6 pb-5">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mt-2">

                {/* Gauge */}
                <div className="w-44 sm:w-48 shrink-0">
                  <GaugeArc percent={taskHealth} color={healthColor} />
                </div>

                {/* Breakdown bars */}
                <div className="flex-1 w-full space-y-3">
                  {[
                    { label: 'Done',    value: tasks.done,   color: C.emerald, nav: '/tasks?status=DONE'    },
                    { label: 'Active',  value: activeAmt,     color: C.indigo,  nav: '/tasks?status=IN_PROGRESS' },
                    { label: 'Overdue', value: tasks.overdue, color: C.amber,   nav: '/tasks'                },
                    { label: 'Blocked', value: tasks.blocked, color: C.red,     nav: '/tasks?status=BLOCKED' },
                  ].map((s) => {
                    const pct = tasks.total > 0 ? Math.round((s.value / tasks.total) * 100) : 0;
                    return (
                      <button
                        key={s.label}
                        onClick={() => navigate(s.nav)}
                        className="w-full text-left group/bar"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                            <span className="text-xs font-medium text-foreground/80 group-hover/bar:text-foreground transition-colors">
                              {s.label}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-bold tabular-nums" style={{ color: s.color }}>
                              {s.value}
                            </span>
                            <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: `${s.color}18` }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: s.color }}
                          />
                        </div>
                      </button>
                    );
                  })}

                  {/* Totals footer */}
                  <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total tasks</span>
                    <span className="text-sm font-bold tabular-nums">{tasks.total}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Task Distribution Donut */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CardIcon icon={CheckSquare} bg="bg-indigo-100" iconCls="text-indigo-600" />
                Task Distribution
                <span className="ml-auto text-xs text-muted-foreground font-normal bg-muted/60 rounded-full px-2.5 py-0.5">
                  {tasks.total} total
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 sm:px-6 pb-5">
              {tasks.total === 0 ? (
                <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                    <CheckSquare className="h-7 w-7 opacity-30" />
                  </div>
                  <p className="text-sm font-medium">No tasks yet</p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 pt-2">
                  <div className="w-full sm:w-[55%] shrink-0">
                    <ResponsiveContainer width="100%" height={195}>
                      <PieChart>
                        <Pie
                          data={taskDonut}
                          cx="50%" cy="50%"
                          innerRadius="52%" outerRadius="82%"
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {taskDonut.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full space-y-3">
                    {taskDonut.map((d) => {
                      const pct = tasks.total > 0 ? Math.round((d.value / tasks.total) * 100) : 0;
                      return (
                        <div key={d.name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                              <span className="text-xs font-medium text-foreground/80">{d.name}</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-bold tabular-nums">{d.value}</span>
                              <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: d.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ Row 2: Dept Comparison + Workload ════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          {/* Dept bar */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CardIcon icon={Building2} bg="bg-violet-100" iconCls="text-violet-600" />
                Department Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 pb-5 pt-3">
              {deptBar.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-muted-foreground gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                    <Building2 className="h-7 w-7 opacity-30" />
                  </div>
                  <p className="text-sm font-medium">No departments yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart
                    data={deptBar}
                    margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                    onClick={(d) => {
                      if (d?.activePayload?.[0])
                        navigate(`/dashboard/${(d.activePayload[0].payload as { slug?: string }).slug ?? ''}`);
                    }}
                  >
                    <defs>
                      <linearGradient id="dtGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.violet} />
                        <stop offset="100%" stopColor={C.indigo} stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="dpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.teal} />
                        <stop offset="100%" stopColor={C.sky} stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(99,102,241,0.04)', radius: 8 }} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar dataKey="tasks"  fill="url(#dtGrad)" radius={[6, 6, 0, 0]} name="Tasks"  maxBarSize={28} />
                    <Bar dataKey="people" fill="url(#dpGrad)" radius={[6, 6, 0, 0]} name="People" maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Workload */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CardIcon icon={Users} bg="bg-sky-100" iconCls="text-sky-600" />
                Team Workload
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                  active tasks / person
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 pb-5 pt-3">
              <WorkloadChart />
            </CardContent>
          </Card>
        </div>

        {/* ══ Row 3: Blockers + Standup ════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          {/* Blocker donut */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CardIcon icon={AlertTriangle} bg="bg-red-100" iconCls="text-red-600" />
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
                  <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <CheckSquare className="h-7 w-7 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-emerald-700">No blockers</p>
                    <p className="text-xs mt-0.5">Team is running smoothly!</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                  <div className="w-full sm:w-[50%] shrink-0">
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie
                          data={blockerDonut}
                          cx="50%" cy="50%"
                          innerRadius="46%" outerRadius="76%"
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {blockerDonut.map((d: { color: string }, i: number) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full space-y-3">
                    {blockerDonut.map((b: { name: string; value: number; color: string }) => (
                      <div key={b.name} className="flex items-center gap-2.5 group/row cursor-pointer" onClick={() => navigate('/tasks?status=BLOCKED')}>
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                        <span className="text-xs flex-1 capitalize font-medium group-hover/row:text-foreground transition-colors" style={{ color: b.color }}>
                          {b.name.toLowerCase()}
                        </span>
                        <span className="text-sm font-bold tabular-nums">{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Standup attendance */}
          <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <CardIcon icon={Zap} bg="bg-yellow-100" iconCls="text-yellow-600" />
                Standup Attendance
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                  {(data?.standupAttendance ?? []).filter((s: { status: string }) => s.status === 'COMPLETED').length}
                  /{(data?.standupAttendance ?? []).length} done
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 sm:px-6 pb-5">
              {!(data?.standupAttendance?.length) ? (
                <div className="flex flex-col items-center justify-center h-52 text-muted-foreground gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-yellow-50 flex items-center justify-center">
                    <Zap className="h-7 w-7 text-yellow-300" />
                  </div>
                  <p className="text-sm font-medium">No standups scheduled today</p>
                </div>
              ) : (
                <div className="space-y-4 pt-3">
                  {(data.standupAttendance as Array<{
                    departmentName: string; status: string;
                    totalMembers?: number; submitted?: number; attendanceRate?: number;
                  }>).map((s, i) => {
                    const rate = s.attendanceRate ?? 0;
                    const barColor = rate >= 80 ? C.emerald : rate >= 50 ? C.amber : C.red;
                    return (
                      <div
                        key={i}
                        className="space-y-2 cursor-pointer group/srow"
                        onClick={() => navigate('/standup')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold truncate group-hover/srow:text-primary transition-colors">
                            {s.departmentName}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {s.submitted}/{s.totalMembers}
                            </span>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${barColor}18`, color: barColor }}
                            >
                              {rate}%
                            </span>
                            <Badge className={cn(
                              'text-[10px] font-semibold rounded-full border-0 px-2',
                              s.status === 'COMPLETED'  ? 'bg-emerald-100 text-emerald-700' :
                              s.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600',
                            )}>
                              {s.status === 'IN_PROGRESS' ? 'Live' : s.status.toLowerCase().replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${rate}%`, background: barColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ Department activity table ═════════════════════════════════════ */}
        <Card className="rounded-2xl border border-border/60 bg-white shadow-sm">
          <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
              <CardIcon icon={TrendingUp} bg="bg-teal-100" iconCls="text-teal-600" />
              Department Activity
              <span className="ml-auto text-[10px] text-muted-foreground">share of org tasks</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-5 pb-4 pt-3">
            <div className="divide-y divide-border/50">
              {(data?.departments ?? []).map((dept: Department, i: number) => {
                const taskPct = tasks.total > 0 ? Math.round((dept._count.tasks / tasks.total) * 100) : 0;
                const gradients = [
                  'from-indigo-400 to-violet-500',
                  'from-sky-400 to-blue-500',
                  'from-teal-400 to-emerald-500',
                  'from-amber-400 to-orange-500',
                  'from-rose-400 to-pink-500',
                ];
                const grad = gradients[i % gradients.length];
                return (
                  <Link
                    key={dept.id}
                    to={dept.slug ? `/dashboard/${dept.slug}` : '/departments'}
                    className="flex items-center gap-3 sm:gap-4 py-3 px-2 sm:px-3 rounded-xl hover:bg-muted/30 transition-colors group"
                  >
                    <div className={cn(
                      'h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br shadow-sm',
                      grad,
                    )}>
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
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', grad)}
                          style={{ width: `${taskPct}%` }}
                        />
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 hidden sm:block" />
                  </Link>
                );
              })}
              {(data?.departments ?? []).length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">No departments to display</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ══ Repeated blockers ════════════════════════════════════════════ */}
        {(blockers?.repeatedBlockers?.length ?? 0) > 0 && (
          <Card className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50/60 to-rose-50/30 shadow-sm">
            <CardHeader className="px-5 sm:px-6 pt-5 pb-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-xl bg-red-100 flex items-center justify-center">
                  <Flame className="h-3.5 w-3.5 text-red-600" />
                </div>
                <span className="text-red-800">Repeated Blockers</span>
                <Badge className="rounded-full bg-red-600 text-white border-0 ml-1">3+ times</Badge>
                <Badge className="ml-auto rounded-full bg-red-100 text-red-700 border-0">{blockers.repeatedBlockers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 sm:px-6 pb-5 pt-3">
              <div className="space-y-2">
                {blockers.repeatedBlockers.map((task: {
                  id: string; title: string; blockerCount: number;
                  assignee?: { id: string; name: string };
                  department?: { name: string };
                }) => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks?status=BLOCKED&taskId=${task.id}`)}
                    className="flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-white border border-red-100/80 hover:border-red-300 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-red-700 transition-colors">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {task.assignee && (
                          <span className="text-xs text-muted-foreground">{task.assignee.name}</span>
                        )}
                        {task.department && (
                          <span className="text-xs text-muted-foreground">· {task.department.name}</span>
                        )}
                      </div>
                    </div>
                    <Badge className="rounded-full bg-red-100 text-red-700 border-0 text-xs shrink-0 font-semibold">
                      {task.blockerCount}× blocked
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ══ Active users dialog ═══════════════════════════════════════════ */}
      <Dialog open={activeUsersOpen} onOpenChange={setActiveUsersOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-xl bg-sky-100 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-sky-600" />
              </div>
              Active Today
              <Badge className="rounded-full bg-sky-100 text-sky-700 border-0 ml-1">
                {data?.activeUsers ?? 0}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-3">Logged in within the last 24 hours</p>
          {!(data?.activeUsersList?.length) ? (
            <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
              <Users className="h-8 w-8 opacity-20" />
              <p className="text-sm">No one has logged in today yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {(data.activeUsersList as Array<{
                id: string; name: string; role: string; lastLoginAt: string;
                department?: { name: string };
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
                      {u.role.toLowerCase().replace(/_/g, ' ')}
                      {u.department ? ` · ${u.department.name}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    {formatRelative(u.lastLoginAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
