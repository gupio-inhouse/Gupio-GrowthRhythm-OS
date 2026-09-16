import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ExcelJS from 'exceljs';
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  BarChart3, CheckCircle2, ClipboardList, Users as UsersIcon,
  Bug as BugIcon, AlertTriangle, Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/api/client';
import {
  cn, formatDate, priorityColor, statusColor, getInitials,
  calcWorkingMs, formatWorkingMs,
} from '@/lib/utils';

// ── Chart palette (matches the Dashboard page's chart colors) ──────────────────
const C = {
  green: '#22c55e', blue: '#3b82f6', orange: '#f97316', amber: '#f59e0b',
  red: '#ef4444', slate: '#94a3b8', indigo: '#6366f1', violet: '#8b5cf6', cyan: '#06b6d4',
};

type ScopeType = 'individual' | 'department';
type PeriodType = 'week' | 'month' | 'custom';

type UserItem = { id: string; name: string; role: string };
type DeptItem = { id: string; name: string };

type TaskDelay = { kind: 'overdue' | 'late'; label: string } | null;

type ReportTask = {
  id: string; title: string; status: string; priority: string;
  startDate?: string | null; dueDate?: string | null; completedAt?: string | null;
  blockerType?: string | null;
  team?: { id: string; name: string } | null;
  delay?: TaskDelay;
};

type ReportBug = {
  id: string; title: string; type: string; status: string; severity: string;
  createdAt: string; resolvedAt?: string | null; closedAt?: string | null;
  team?: { id: string; name: string } | null;
};

type BugSummary = {
  totalBugs: number; resolvedBugs: number; inReviewBugs: number; openBugs: number; bugResolutionRate: number;
};

type TaskSummary = {
  totalTasks: number; completedTasks: number; inProgressTasks: number; blockedTasks: number;
  inReviewTasks: number; todoTasks: number; cancelledTasks: number; overdueTasks: number;
  lateCompletedTasks: number; onTimeCompletedTasks: number; completionRate: number; onTimeRate: number;
};

type IndividualReportResp = {
  user: { id: string; name: string; email: string; role: string; department?: { id: string; name: string } | null };
  from: string; to: string;
  summary: TaskSummary;
  tasks: ReportTask[];
  bugSummary: BugSummary;
  bugs: ReportBug[];
};

type DeptMemberRow = TaskSummary & {
  userId: string; name: string; role: string;
  tasks: ReportTask[];
  bugSummary: BugSummary;
};

type DeptReportResp = {
  department: { id: string; name: string };
  from: string; to: string;
  summary: TaskSummary;
  members: DeptMemberRow[];
  bugSummary: BugSummary;
};

const BUG_STATUS_STYLE: Record<string, string> = {
  OPEN: 'text-slate-600 bg-slate-100', REOPENED: 'text-orange-600 bg-orange-50',
  IN_PROGRESS: 'text-blue-600 bg-blue-50', IN_REVIEW: 'text-amber-700 bg-amber-50',
  FIXED: 'text-green-600 bg-green-50', CLOSED: 'text-gray-500 bg-gray-100',
  WONT_FIX: 'text-gray-500 bg-gray-100', DUPLICATE: 'text-gray-500 bg-gray-100',
};

// ── Excel export helpers ────────────────────────────────────────────────────────
// One plain worksheet, no charts — just data, stacked as labelled sections. A real
// .xlsx (vs. CSV) still avoids two CSV-in-Excel quirks: mojibake from missing
// encoding info on non-ASCII characters (e.g. the "–" in a date range), and Excel
// auto-detecting date-shaped text and showing #### when its date format doesn't
// fit the column — every cell here is written as an explicit string.
function writeSectionTitle(sheet: ExcelJS.Worksheet, row: number, title: string): number {
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 13 };
  return row + 1;
}

function writeMetricRows(sheet: ExcelJS.Worksheet, row: number, rows: Array<{ metric: string; value: string | number }>): number {
  rows.forEach((r, i) => {
    sheet.getCell(row + i, 1).value = r.metric;
    sheet.getCell(row + i, 2).value = r.value;
  });
  return row + rows.length;
}

function writeTableRows(sheet: ExcelJS.Worksheet, row: number, rows: Array<Record<string, unknown>>): number {
  if (rows.length === 0) return row;
  const headers = Object.keys(rows[0]);
  headers.forEach((h, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = h.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
    cell.font = { bold: true };
  });
  rows.forEach((r, ri) => {
    headers.forEach((h, ci) => {
      sheet.getCell(row + 1 + ri, ci + 1).value = (r[h] as ExcelJS.CellValue) ?? '';
    });
  });
  return row + 1 + rows.length;
}

function newReportSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('Report');
  sheet.columns = Array.from({ length: 10 }, () => ({ width: 20 }));
  return sheet;
}

// exceljs's writeBuffer() is typed for both Node (Buffer) and browser (ArrayBuffer)
// targets; in this browser bundle it's always an ArrayBuffer at runtime.
function downloadWorkbookBuffer(filename: string, buffer: ArrayBuffer) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}

// Summary rows shared by both scopes' Excel exports — one label/value pair per metric.
function summaryMetricRows(periodLabel: string, summary: TaskSummary, bugSummary?: BugSummary) {
  const rows: Array<{ metric: string; value: string | number }> = [
    { metric: 'Report Period', value: periodLabel },
    { metric: 'Total Tasks', value: summary.totalTasks },
    { metric: 'Completed', value: summary.completedTasks },
    { metric: 'In Progress', value: summary.inProgressTasks },
    { metric: 'Blocked', value: summary.blockedTasks },
    { metric: 'In Review', value: summary.inReviewTasks },
    { metric: 'To Do', value: summary.todoTasks },
    { metric: 'Cancelled', value: summary.cancelledTasks },
    { metric: 'Overdue', value: summary.overdueTasks },
    { metric: 'Completed Late', value: summary.lateCompletedTasks },
    { metric: 'Completion Rate', value: `${summary.completionRate}%` },
    { metric: 'On-Time Completion Rate', value: `${summary.onTimeRate}%` },
  ];
  if (bugSummary && bugSummary.totalBugs > 0) {
    rows.push(
      { metric: 'Total Bugs', value: bugSummary.totalBugs },
      { metric: 'Bugs Resolved', value: bugSummary.resolvedBugs },
      { metric: 'Bugs In Review', value: bugSummary.inReviewBugs },
      { metric: 'Bugs Open', value: bugSummary.openBugs },
      { metric: 'Bug Resolution Rate', value: `${bugSummary.bugResolutionRate}%` },
    );
  }
  return rows;
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999);
  return e;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); }
function endOfMonth(d: Date) {
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  e.setHours(23, 59, 59, 999);
  return e;
}

// Sum of working-hour durations across tasks — used for a member/department "Total Duration".
// Reports always treat Monday–Saturday as working days (Sunday only excluded), regardless
// of department — unlike the Mon–Fri Engineering rule used for task deadlines/date pickers.
function taskDurationMs(task: ReportTask): number {
  const end = task.dueDate || task.completedAt;
  if (!task.startDate || !end) return 0;
  return calcWorkingMs(new Date(task.startDate), new Date(end), false);
}

function TaskDurationCell({ task }: { task: ReportTask }) {
  const label = formatWorkingMs(taskDurationMs(task));
  return <span className="text-sm tabular-nums">{label ?? '—'}</span>;
}

// Overdue (still open, past due) shows red; late (finished after due date) shows orange —
// on time / not yet due / no due date renders as a plain dash.
function DelayCell({ delay }: { delay?: TaskDelay }) {
  if (!delay) return <span className="text-sm text-muted-foreground">—</span>;
  const tone = delay.kind === 'overdue' ? 'text-red-600 bg-red-50 border-red-200' : 'text-orange-600 bg-orange-50 border-orange-200';
  return <Badge className={cn('border', tone)}>{delay.label}</Badge>;
}

const STAT_TONE = {
  completion: 'text-green-600 bg-green-50',
  total: 'text-blue-600 bg-blue-50',
  members: 'text-violet-600 bg-violet-50',
} as const;

// ── Completion-rate gauge (SVG arc) ─────────────────────────────────────────────
function GaugeArc({ percent, color, label }: { percent: number; color: string; label: string }) {
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
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize={38} fontWeight={900} fill={color} fontFamily="inherit">{percent}</text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize={13} fontWeight={600} fill={color} opacity={0.7} fontFamily="inherit">%</text>
      <text x={CX} y={CY + 32} textAnchor="middle" fontSize={10} fill="#94a3b8" fontFamily="inherit">{label}</text>
    </svg>
  );
}

function PieTip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl border border-border/60 bg-white/95 backdrop-blur-sm shadow-xl px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.payload.color }} />
        <span className="text-xs text-muted-foreground">{p.name}</span>
        <span className="text-sm font-bold ml-2 tabular-nums">{p.value}</span>
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-white/95 backdrop-blur-sm shadow-xl px-3 py-2 min-w-[110px]">
      {label && <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">{label}</p>}
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

// ── Status breakdown donut ──────────────────────────────────────────────────────
function StatusDonut({ summary }: { summary: TaskSummary }) {
  const slices = [
    { name: 'Completed', value: summary.completedTasks, color: C.green },
    { name: 'In Progress', value: summary.inProgressTasks, color: C.blue },
    { name: 'In Review', value: summary.inReviewTasks, color: C.violet },
    { name: 'Blocked', value: summary.blockedTasks, color: C.red },
    { name: 'To Do', value: summary.todoTasks, color: C.slate },
    { name: 'Cancelled', value: summary.cancelledTasks, color: '#cbd5e1' },
  ].filter((s) => s.value > 0);

  if (slices.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">No tasks to chart in this period.</p>;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* Fixed-size wrapper — ResponsiveContainer measures its parent, and a flex
          item with no explicit width/height can collapse it to a sliver. */}
      <div className="w-full sm:w-[200px] h-[200px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={3} dataKey="value" strokeWidth={0} isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip content={<PieTip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 flex-1">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-muted-foreground flex-1">{s.name}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Per-member comparison bar chart (department scope) ──────────────────────────
function MemberBarChart({ members }: { members: Array<{ name: string; completedTasks: number }> }) {
  const chartData = [...members]
    .sort((a, b) => b.completedTasks - a.completedTasks)
    .slice(0, 10)
    .map((m) => ({ name: m.name.split(' ')[0], completed: m.completedTasks }));
  const yAxisWidth = chartData.length ? Math.max(64, Math.min(120, Math.max(...chartData.map((d) => d.name.length)) * 7 + 10)) : 64;

  if (chartData.every((d) => d.completed === 0)) {
    return <p className="text-sm text-muted-foreground text-center py-10">No completed tasks to chart in this period.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 34)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="reportsBarGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.indigo} /><stop offset="100%" stopColor={C.violet} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 600 }} width={yAxisWidth} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
        <Bar dataKey="completed" fill="url(#reportsBarGrad)" radius={[0, 8, 8, 0]} name="Completed Tasks" maxBarSize={18} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatTile({ label, value, sub, icon: Icon, tone }: { label: string; value: string | number; sub?: string; icon: typeof CheckCircle2; tone: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={cn('rounded-lg p-2.5', tone)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const [scope, setScope] = useState<ScopeType>('individual');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [period, setPeriod] = useState<PeriodType>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [generated, setGenerated] = useState<{ from: string; to: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });
  const { data: departments = [] } = useQuery<DeptItem[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  const range = (() => {
    const now = new Date();
    if (period === 'week') return { from: startOfWeek(now), to: endOfWeek(now) };
    if (period === 'month') return { from: startOfMonth(now), to: endOfMonth(now) };
    if (customFrom && customTo) return { from: new Date(`${customFrom}T00:00:00`), to: new Date(`${customTo}T23:59:59`) };
    return null;
  })();

  const canGenerate = !!range && (scope === 'individual' ? !!selectedUserId : !!selectedDeptId);

  const individualQuery = useQuery<IndividualReportResp>({
    queryKey: ['custom-report-individual', selectedUserId, generated?.from, generated?.to],
    queryFn: () => api.get(`/reports/individual/${selectedUserId}`, { params: generated }).then((r) => r.data),
    enabled: scope === 'individual' && !!selectedUserId && !!generated,
  });

  const deptQuery = useQuery<DeptReportResp>({
    queryKey: ['custom-report-department', selectedDeptId, generated?.from, generated?.to],
    queryFn: () => api.get(`/reports/department/${selectedDeptId}`, { params: generated }).then((r) => r.data),
    enabled: scope === 'department' && !!selectedDeptId && !!generated,
  });

  const handleGenerate = () => {
    if (!range) return;
    setGenerated({ from: range.from.toISOString(), to: range.to.toISOString() });
  };

  const isLoading = scope === 'individual' ? individualQuery.isFetching : deptQuery.isFetching;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate a task report for one person or a whole department, over any date range.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          {/* Scope */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</Label>
            <div className="flex gap-1.5">
              <Button
                type="button" size="sm"
                variant={scope === 'individual' ? 'default' : 'outline'}
                onClick={() => { setScope('individual'); setGenerated(null); }}
              >
                Individual
              </Button>
              <Button
                type="button" size="sm"
                variant={scope === 'department' ? 'default' : 'outline'}
                onClick={() => { setScope('department'); setGenerated(null); }}
              >
                Department
              </Button>
            </div>
          </div>

          {/* Target picker */}
          {scope === 'individual' ? (
            <div className="space-y-1.5">
              <Label>Person</Label>
              <Select value={selectedUserId || '__none__'} onValueChange={(v) => { setSelectedUserId(v === '__none__' ? '' : v); setGenerated(null); }}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select a person..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Select a person...</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={selectedDeptId || '__none__'} onValueChange={(v) => { setSelectedDeptId(v === '__none__' ? '' : v); setGenerated(null); }}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select a department..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Select a department...</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Period */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period</Label>
            <div className="flex flex-wrap gap-1.5">
              {(['week', 'month', 'custom'] as const).map((p) => (
                <Button
                  key={p} type="button" size="sm"
                  variant={period === p ? 'default' : 'outline'}
                  onClick={() => { setPeriod(p); setGenerated(null); }}
                >
                  {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom Range'}
                </Button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setGenerated(null); }} className="w-40" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => { setCustomTo(e.target.value); setGenerated(null); }} className="w-40" />
              </div>
            )}
          </div>

          <Button onClick={handleGenerate} disabled={!canGenerate || isLoading} className="gap-2">
            <BarChart3 className="h-4 w-4" />
            {isLoading ? 'Generating...' : 'Generate Report'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Individual results ── */}
      {scope === 'individual' && generated && individualQuery.data && (() => {
        const data = individualQuery.data;
        const hasBugs = data.bugSummary.totalBugs > 0;

        const exportExcel = async () => {
          setIsExporting(true);
          try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'GrowthRhythm OS';
            const sheet = newReportSheet(workbook);

            let row = writeSectionTitle(sheet, 1, 'Summary');
            row = writeMetricRows(sheet, row, summaryMetricRows(`${formatDate(data.from)} – ${formatDate(data.to)}`, data.summary, data.bugSummary));
            row += 2;

            row = writeSectionTitle(sheet, row, 'Tasks');
            row = writeTableRows(sheet, row, data.tasks.map((t) => ({
              employeeName: data.user.name, employeeEmail: data.user.email,
              department: data.user.department?.name || '', project: t.team?.name || '',
              taskTitle: t.title, status: t.status, priority: t.priority,
              blockerType: t.blockerType || '', assignedDate: t.startDate ? formatDate(t.startDate) : '—', endDate: t.dueDate ? formatDate(t.dueDate) : '—',
              duration: formatWorkingMs(taskDurationMs(t)) || '',
              delay: t.delay?.label || '',
            })));

            if (data.bugs.length > 0) {
              row += 2;
              row = writeSectionTitle(sheet, row, 'Bugs');
              writeTableRows(sheet, row, data.bugs.map((b) => ({
                title: b.title, project: b.team?.name || '', type: b.type, status: b.status, severity: b.severity,
                createdAt: formatDate(b.createdAt), resolvedAt: (b.closedAt || b.resolvedAt) ? formatDate(b.closedAt || b.resolvedAt!) : '—',
              })));
            }

            const buffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;
            downloadWorkbookBuffer(`${data.user.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.xlsx`, buffer);
          } finally {
            setIsExporting(false);
          }
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">{formatDate(data.from)} – {formatDate(data.to)}</Badge>
                <span className="text-sm font-semibold">{data.user.name}</span>
                <span className="text-xs text-muted-foreground">{data.user.email}</span>
                {data.user.department && <span className="text-xs text-muted-foreground">{data.user.department.name}</span>}
              </div>
              <Button size="sm" variant="outline" onClick={exportExcel} disabled={isExporting} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> {isExporting ? 'Preparing…' : 'Download Excel'}
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatTile label="Completion" value={`${data.summary.completionRate}%`} sub={`${data.summary.completedTasks}/${data.summary.totalTasks} done`} icon={CheckCircle2} tone={STAT_TONE.completion} />
              <StatTile label="On-Time Rate" value={`${data.summary.onTimeRate}%`} sub={`${data.summary.onTimeCompletedTasks}/${data.summary.completedTasks} on time`} icon={CheckCircle2} tone="text-emerald-600 bg-emerald-50" />
              <StatTile label="Total Tasks" value={data.summary.totalTasks} icon={ClipboardList} tone={STAT_TONE.total} />
              <StatTile label="In Progress" value={data.summary.inProgressTasks} sub={`${data.summary.todoTasks} to do`} icon={ClipboardList} tone="text-blue-600 bg-blue-50" />
              <StatTile label="Blocked" value={data.summary.blockedTasks} icon={AlertTriangle} tone="text-orange-600 bg-orange-50" />
              <StatTile label="Overdue" value={data.summary.overdueTasks} sub={`${data.summary.lateCompletedTasks} finished late`} icon={AlertTriangle} tone="text-red-600 bg-red-50" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Completion Rate</CardTitle></CardHeader>
                <CardContent><GaugeArc percent={data.summary.completionRate} color={C.green} label="completion rate" /></CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader>
                <CardContent><StatusDonut summary={data.summary} /></CardContent>
              </Card>
            </div>

            {hasBugs && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <BugIcon className="h-4 w-4" /> Bug Tracker
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatTile label="Resolution Rate" value={`${data.bugSummary.bugResolutionRate}%`} sub={`${data.bugSummary.resolvedBugs}/${data.bugSummary.totalBugs} resolved`} icon={CheckCircle2} tone="text-cyan-600 bg-cyan-50" />
                  <StatTile label="Open" value={data.bugSummary.openBugs} icon={BugIcon} tone="text-cyan-600 bg-cyan-50" />
                  <StatTile label="In Review" value={data.bugSummary.inReviewBugs} icon={AlertTriangle} tone="text-amber-600 bg-amber-50" />
                  <StatTile label="Resolved" value={data.bugSummary.resolvedBugs} icon={CheckCircle2} tone="text-green-600 bg-green-50" />
                </div>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Tasks in period</CardTitle></CardHeader>
              <CardContent>
                {data.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks due or completed in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-4 font-semibold">Title</th>
                          <th className="py-2 pr-4 font-semibold">Project</th>
                          <th className="py-2 pr-4 font-semibold">Status</th>
                          <th className="py-2 pr-4 font-semibold">Priority</th>
                          <th className="py-2 pr-4 font-semibold">Assigned Date</th>
                          <th className="py-2 pr-4 font-semibold">End Date</th>
                          <th className="py-2 pr-4 font-semibold">Duration</th>
                          <th className="py-2 pr-4 font-semibold">Delay</th>
                          <th className="py-2 pr-4 font-semibold">Blocker</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tasks.map((t) => (
                          <tr key={t.id} className="border-b border-border/40 last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{t.title}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.team?.name || '—'}</td>
                            <td className="py-2.5 pr-4">
                              <Badge className={cn('border', statusColor(t.status))}>{t.status.replace(/_/g, ' ')}</Badge>
                            </td>
                            <td className="py-2.5 pr-4">
                              <Badge className={cn('border', priorityColor(t.priority))}>{t.priority}</Badge>
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.startDate ? formatDate(t.startDate) : '—'}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.dueDate ? formatDate(t.dueDate) : '—'}</td>
                            <td className="py-2.5 pr-4"><TaskDurationCell task={t} /></td>
                            <td className="py-2.5 pr-4"><DelayCell delay={t.delay} /></td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.blockerType ? t.blockerType.toLowerCase().replace(/_/g, ' ') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {hasBugs && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-1.5"><BugIcon className="h-4 w-4" /> Bugs in period</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-4 font-semibold">Title</th>
                          <th className="py-2 pr-4 font-semibold">Project</th>
                          <th className="py-2 pr-4 font-semibold">Status</th>
                          <th className="py-2 pr-4 font-semibold">Severity</th>
                          <th className="py-2 pr-4 font-semibold">Created</th>
                          <th className="py-2 pr-4 font-semibold">Resolved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bugs.map((b) => (
                          <tr key={b.id} className="border-b border-border/40 last:border-0">
                            <td className="py-2.5 pr-4 font-medium">
                              {b.title}
                              {b.type === 'ENHANCEMENT' && <Badge className="ml-2 border text-violet-600 bg-violet-50">Improvement</Badge>}
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{b.team?.name || '—'}</td>
                            <td className="py-2.5 pr-4">
                              <Badge className={cn('border', BUG_STATUS_STYLE[b.status] ?? 'text-gray-600 bg-gray-100')}>{b.status.replace(/_/g, ' ')}</Badge>
                            </td>
                            <td className="py-2.5 pr-4">
                              <Badge className={cn('border', priorityColor(b.severity))}>{b.severity}</Badge>
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{formatDate(b.createdAt)}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{b.closedAt || b.resolvedAt ? formatDate(b.closedAt || b.resolvedAt!) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* ── Department results ── */}
      {scope === 'department' && generated && deptQuery.data && (() => {
        const data = deptQuery.data;
        const hasBugs = data.bugSummary.totalBugs > 0;

        const exportExcel = async () => {
          setIsExporting(true);
          try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'GrowthRhythm OS';
            const sheet = newReportSheet(workbook);

            let row = writeSectionTitle(sheet, 1, 'Summary');
            row = writeMetricRows(sheet, row, summaryMetricRows(`${formatDate(data.from)} – ${formatDate(data.to)}`, data.summary, data.bugSummary));
            row += 2;

            row = writeSectionTitle(sheet, row, 'Per-Member Summary');
            row = writeTableRows(sheet, row, data.members.map((m) => ({
              memberName: m.name, role: m.role,
              totalTasks: m.totalTasks, completed: m.completedTasks, inProgress: m.inProgressTasks,
              blocked: m.blockedTasks, overdue: m.overdueTasks,
              completionRate: `${m.completionRate}%`, onTimeRate: `${m.onTimeRate}%`,
              bugsFixed: m.bugSummary.resolvedBugs, bugsOpen: m.bugSummary.openBugs,
            })));
            row += 2;

            row = writeSectionTitle(sheet, row, 'Tasks');
            writeTableRows(sheet, row, data.members.flatMap((m) =>
              m.tasks.length > 0
                ? m.tasks.map((t) => ({
                    department: data.department.name, memberName: m.name, memberRole: m.role,
                    project: t.team?.name || '', taskTitle: t.title, status: t.status, priority: t.priority,
                    blockerType: t.blockerType || '', assignedDate: t.startDate ? formatDate(t.startDate) : '—', endDate: t.dueDate ? formatDate(t.dueDate) : '—',
                    duration: formatWorkingMs(taskDurationMs(t)) || '', delay: t.delay?.label || '',
                  }))
                : [{
                    department: data.department.name, memberName: m.name, memberRole: m.role,
                    project: '', taskTitle: '(no tasks in period)', status: '', priority: '',
                    blockerType: '', assignedDate: '—', endDate: '—', duration: '', delay: '',
                  }]
            ));

            const buffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;
            downloadWorkbookBuffer(`${data.department.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.xlsx`, buffer);
          } finally {
            setIsExporting(false);
          }
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">{formatDate(data.from)} – {formatDate(data.to)}</Badge>
                <span className="text-sm font-semibold">{data.department.name}</span>
              </div>
              <Button size="sm" variant="outline" onClick={exportExcel} disabled={isExporting} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> {isExporting ? 'Preparing…' : 'Download Excel'}
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatTile label="Completion" value={`${data.summary.completionRate}%`} sub={`${data.summary.completedTasks}/${data.summary.totalTasks} done`} icon={CheckCircle2} tone={STAT_TONE.completion} />
              <StatTile label="On-Time Rate" value={`${data.summary.onTimeRate}%`} sub={`${data.summary.onTimeCompletedTasks}/${data.summary.completedTasks} on time`} icon={CheckCircle2} tone="text-emerald-600 bg-emerald-50" />
              <StatTile label="Total Tasks" value={data.summary.totalTasks} icon={ClipboardList} tone={STAT_TONE.total} />
              <StatTile label="In Progress" value={data.summary.inProgressTasks} sub={`${data.summary.todoTasks} to do`} icon={ClipboardList} tone="text-blue-600 bg-blue-50" />
              <StatTile label="Overdue" value={data.summary.overdueTasks} sub={`${data.summary.lateCompletedTasks} finished late`} icon={AlertTriangle} tone="text-red-600 bg-red-50" />
              <StatTile label="Members" value={data.members.length} icon={UsersIcon} tone={STAT_TONE.members} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Completion Rate</CardTitle></CardHeader>
                <CardContent><GaugeArc percent={data.summary.completionRate} color={C.green} label="completion rate" /></CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader>
                <CardContent><StatusDonut summary={data.summary} /></CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Completed Tasks by Member</CardTitle></CardHeader>
              <CardContent><MemberBarChart members={data.members} /></CardContent>
            </Card>

            {hasBugs && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <BugIcon className="h-4 w-4" /> Bug Tracker
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatTile label="Resolution Rate" value={`${data.bugSummary.bugResolutionRate}%`} sub={`${data.bugSummary.resolvedBugs}/${data.bugSummary.totalBugs} resolved`} icon={CheckCircle2} tone="text-cyan-600 bg-cyan-50" />
                  <StatTile label="Open" value={data.bugSummary.openBugs} icon={BugIcon} tone="text-cyan-600 bg-cyan-50" />
                  <StatTile label="In Review" value={data.bugSummary.inReviewBugs} icon={AlertTriangle} tone="text-amber-600 bg-amber-50" />
                  <StatTile label="Resolved" value={data.bugSummary.resolvedBugs} icon={CheckCircle2} tone="text-green-600 bg-green-50" />
                </div>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Per-member breakdown</CardTitle></CardHeader>
              <CardContent>
                {data.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active members in this department.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-4 font-semibold">Member</th>
                          <th className="py-2 pr-4 font-semibold">Role</th>
                          <th className="py-2 pr-4 font-semibold">Tasks</th>
                          <th className="py-2 pr-4 font-semibold">Completed</th>
                          <th className="py-2 pr-4 font-semibold">In Progress</th>
                          <th className="py-2 pr-4 font-semibold">Overdue</th>
                          <th className="py-2 pr-4 font-semibold">Completion</th>
                          <th className="py-2 pr-4 font-semibold">On-Time</th>
                          <th className="py-2 pr-4 font-semibold">Total Duration</th>
                          {hasBugs && <th className="py-2 pr-4 font-semibold">Bugs Fixed</th>}
                          {hasBugs && <th className="py-2 pr-4 font-semibold">Bugs Open</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.members.map((m) => {
                          const totalMs = m.tasks.reduce((s, t) => s + taskDurationMs(t), 0);
                          return (
                            <tr key={m.userId} className="border-b border-border/40 last:border-0">
                              <td className="py-2.5 pr-4 font-medium flex items-center gap-2">
                                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {getInitials(m.name)}
                                </span>
                                {m.name}
                              </td>
                              <td className="py-2.5 pr-4 text-muted-foreground">{m.role.toLowerCase().replace(/_/g, ' ')}</td>
                              <td className="py-2.5 pr-4">{m.totalTasks}</td>
                              <td className="py-2.5 pr-4">{m.completedTasks}</td>
                              <td className="py-2.5 pr-4">{m.inProgressTasks}</td>
                              <td className={cn('py-2.5 pr-4', m.overdueTasks > 0 && 'text-red-600 font-semibold')}>{m.overdueTasks || '—'}</td>
                              <td className="py-2.5 pr-4 font-semibold">{m.completionRate}%</td>
                              <td className="py-2.5 pr-4 text-emerald-600 font-semibold">{m.onTimeRate}%</td>
                              <td className="py-2.5 pr-4 tabular-nums">{formatWorkingMs(totalMs) ?? '—'}</td>
                              {hasBugs && <td className="py-2.5 pr-4">{m.bugSummary.resolvedBugs || '—'}</td>}
                              {hasBugs && <td className="py-2.5 pr-4">{m.bugSummary.openBugs || '—'}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
