import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CheckCircle2, ClipboardList, Users as UsersIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/api/client';
import {
  cn, formatDate, priorityColor, statusColor, getInitials,
  isEngineeringDept, calcWorkingMs, formatWorkingMs,
} from '@/lib/utils';

type ScopeType = 'individual' | 'department';
type PeriodType = 'week' | 'month' | 'custom';

type UserItem = { id: string; name: string; role: string };
type DeptItem = { id: string; name: string };

type ReportTask = {
  id: string; title: string; status: string; priority: string;
  startDate?: string | null; dueDate?: string | null; completedAt?: string | null;
  team?: { id: string; name: string } | null;
};

type IndividualReportResp = {
  user: { id: string; name: string; department?: { id: string; name: string } | null };
  from: string; to: string;
  summary: { totalTasks: number; completedTasks: number; completionRate: number };
  tasks: ReportTask[];
};

type DeptMemberRow = {
  userId: string; name: string; role: string;
  totalTasks: number; completedTasks: number; completionRate: number;
  tasks: ReportTask[];
};

type DeptReportResp = {
  department: { id: string; name: string };
  from: string; to: string;
  summary: { totalTasks: number; completedTasks: number; completionRate: number };
  members: DeptMemberRow[];
};

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
function taskDurationMs(task: ReportTask, excludeSat: boolean): number {
  const end = task.dueDate || task.completedAt;
  if (!task.startDate || !end) return 0;
  return calcWorkingMs(new Date(task.startDate), new Date(end), excludeSat);
}

function TaskDurationCell({ task, excludeSat }: { task: ReportTask; excludeSat: boolean }) {
  const label = formatWorkingMs(taskDurationMs(task, excludeSat));
  return <span className="text-sm tabular-nums">{label ?? '—'}</span>;
}

const STAT_TONE = {
  completion: 'text-green-600 bg-green-50',
  total: 'text-blue-600 bg-blue-50',
  members: 'text-violet-600 bg-violet-50',
} as const;

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
        const excludeSat = isEngineeringDept(data.user.department?.name);
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">{formatDate(data.from)} – {formatDate(data.to)}</Badge>
              <span className="text-sm font-semibold">{data.user.name}</span>
              {data.user.department && <span className="text-xs text-muted-foreground">{data.user.department.name}</span>}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatTile label="Completion" value={`${data.summary.completionRate}%`} sub={`${data.summary.completedTasks}/${data.summary.totalTasks} done`} icon={CheckCircle2} tone={STAT_TONE.completion} />
              <StatTile label="Total Tasks" value={data.summary.totalTasks} icon={ClipboardList} tone={STAT_TONE.total} />
              <StatTile label="Completed" value={data.summary.completedTasks} icon={CheckCircle2} tone={STAT_TONE.completion} />
            </div>

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
                          <th className="py-2 pr-4 font-semibold">Status</th>
                          <th className="py-2 pr-4 font-semibold">Priority</th>
                          <th className="py-2 pr-4 font-semibold">Assigned Date</th>
                          <th className="py-2 pr-4 font-semibold">End Date</th>
                          <th className="py-2 pr-4 font-semibold">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tasks.map((t) => (
                          <tr key={t.id} className="border-b border-border/40 last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{t.title}</td>
                            <td className="py-2.5 pr-4">
                              <Badge className={cn('border', statusColor(t.status))}>{t.status.replace(/_/g, ' ')}</Badge>
                            </td>
                            <td className="py-2.5 pr-4">
                              <Badge className={cn('border', priorityColor(t.priority))}>{t.priority}</Badge>
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.startDate ? formatDate(t.startDate) : '—'}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.dueDate ? formatDate(t.dueDate) : '—'}</td>
                            <td className="py-2.5 pr-4"><TaskDurationCell task={t} excludeSat={excludeSat} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ── Department results ── */}
      {scope === 'department' && generated && deptQuery.data && (() => {
        const data = deptQuery.data;
        const excludeSat = isEngineeringDept(data.department.name);
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">{formatDate(data.from)} – {formatDate(data.to)}</Badge>
              <span className="text-sm font-semibold">{data.department.name}</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatTile label="Completion" value={`${data.summary.completionRate}%`} sub={`${data.summary.completedTasks}/${data.summary.totalTasks} done`} icon={CheckCircle2} tone={STAT_TONE.completion} />
              <StatTile label="Total Tasks" value={data.summary.totalTasks} icon={ClipboardList} tone={STAT_TONE.total} />
              <StatTile label="Members" value={data.members.length} icon={UsersIcon} tone={STAT_TONE.members} />
            </div>

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
                          <th className="py-2 pr-4 font-semibold">Completion</th>
                          <th className="py-2 pr-4 font-semibold">Total Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.members.map((m) => {
                          const totalMs = m.tasks.reduce((s, t) => s + taskDurationMs(t, excludeSat), 0);
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
                              <td className="py-2.5 pr-4 font-semibold">{m.completionRate}%</td>
                              <td className="py-2.5 pr-4 tabular-nums">{formatWorkingMs(totalMs) ?? '—'}</td>
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
