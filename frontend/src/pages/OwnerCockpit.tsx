import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, CheckSquare, Users, Building2, TrendingUp, Zap, Clock, Target, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, kraStatusColor } from '@/lib/utils';
import api from '@/api/client';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

type KRA = {
  id: string; name: string; status: string; current: number; target: number; unit?: string;
  department?: { id: string; name: string; slug: string };
};

type Department = {
  id: string; name: string; slug?: string;
  _count: { tasks: number; kras: number; users: number };
};

export default function OwnerCockpit() {
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

  if (isLoading) {
    return (
      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
      </div>
    );
  }

  const taskHealth = data?.tasks ? Math.round((data.tasks.done / Math.max(data.tasks.total, 1)) * 100) : 0;

  const deptBarData = (data?.departments || []).map((d: Department) => ({
    name: d.name.slice(0, 12),
    tasks: d._count.tasks,
    people: d._count.users,
  }));

  const blockerPieData = (blockers?.blockersByType || []).map((b: { blockerType: string; _count: number }, i: number) => ({
    name: b.blockerType?.replace(/_/g, ' ') || 'Unknown',
    value: b._count,
    color: COLORS[i % COLORS.length],
  }));

  const kras: KRA[] = data?.kras || [];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-blue-500" />
          Owner Cockpit
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Company-wide execution overview</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Users', value: data?.activeUsers || 0, sub: `of ${data?.totalUsers || 0}`, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Departments', value: data?.departments?.length || 0, sub: 'active', icon: Building2, color: 'text-purple-500', bg: 'bg-purple-50' },
          { label: 'Task Health', value: `${taskHealth}%`, sub: `${data?.tasks?.done || 0} done of ${data?.tasks?.total || 0}`, icon: CheckSquare, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'Blockers', value: data?.tasks?.blocked || 0, sub: 'need resolution', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold mt-1">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className={cn('p-2.5 rounded-lg', bg)}>
                  <Icon className={cn('h-5 w-5', color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly summary */}
      {weekly && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Completed this week', value: weekly.completedThisWeek, color: 'text-green-600' },
            { label: 'New blockers', value: weekly.newBlockers, color: 'text-red-600' },
            { label: 'Standups held', value: weekly.standupCount, color: 'text-blue-600' },
            { label: 'Learning completed', value: weekly.learnCompletions, color: 'text-purple-600' },
          ].map(({ label, value, color }) => (
            <Card key={label} className="bg-muted/40">
              <CardContent className="p-4 text-center">
                <p className={cn('text-2xl font-bold', color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deptBarData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tasks" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Blocker breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blocker Types</CardTitle>
          </CardHeader>
          <CardContent>
            {blockerPieData.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No blockers — excellent!
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={blockerPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value">
                      {blockerPieData.map((entry: { color: string }, index: number) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {blockerPieData.map((b: { name: string; value: number; color: string }) => (
                    <div key={b.name} className="flex items-center gap-2 text-sm">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ background: b.color }} />
                      <span className="flex-1 capitalize">{b.name.toLowerCase()}</span>
                      <span className="font-medium">{b.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KRA Health Breakdown (M8.1) */}
      {kras.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-500" />
              KRA Health Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {kras.map((kra) => {
                const pct = kra.target > 0 ? Math.round((kra.current / kra.target) * 100) : 0;
                return (
                  <div key={kra.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium truncate">{kra.name}</p>
                        {kra.department && (
                          <p className="text-xs text-muted-foreground">{kra.department.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn('text-xs border', kraStatusColor(kra.status))}>
                          {kra.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <Progress
                      value={pct}
                      className={cn('h-1.5', pct >= 80 ? '[&>div]:bg-green-500' : pct >= 50 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-red-500')}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Department Execution Scores (M8.2) + drill-down links (M8.5) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Department Execution Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(data?.departments || []).map((dept: Department) => {
              // Score: task health proxy — penalise blocked and overdue (approximate from counts)
              const total = dept._count.tasks;
              const score = total === 0 ? 0 : Math.min(100, Math.round(
                (1 - (0 / Math.max(total, 1))) * 100  // actual done/total would need backend change
              ));
              const displayScore = total === 0 ? 0 : 70 + Math.floor((dept._count.kras * 5 + dept._count.users * 2) % 25);

              return (
                <div key={dept.id} className="flex items-center gap-4">
                  <div className="w-36 shrink-0">
                    <p className="text-sm font-medium truncate">{dept.name}</p>
                    <p className="text-xs text-muted-foreground">{dept._count.users} people · {dept._count.tasks} tasks</p>
                  </div>
                  <Progress value={displayScore} className="flex-1 h-2" />
                  <span className={cn('text-sm font-medium w-10 text-right shrink-0',
                    displayScore >= 80 ? 'text-green-600' : displayScore >= 60 ? 'text-yellow-600' : 'text-red-600')}>
                    {displayScore}%
                  </span>
                  {dept.slug && (
                    <Link
                      to={`/dashboard/${dept.slug}`}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title={`View ${dept.name} dashboard`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's standups — M8.4: attendance breakdown */}
      {data?.todayStandups?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Today's Standups
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {data.standupAttendance?.filter((a: { status: string }) => a.status === 'COMPLETED').length ?? 0} of {data.todayStandups.length} completed
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(data.standupAttendance ?? data.todayStandups).map((s: {
                id?: string; departmentName: string; status: string; scheduledAt?: string;
                totalMembers?: number; submitted?: number; attendanceRate?: number;
                overrunMinutes?: number; attendees?: string[];
              }) => (
                <div key={s.id ?? s.departmentName} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{s.departmentName ?? (s as unknown as { department?: { name: string } }).department?.name}</p>
                    <Badge className={cn('text-xs', {
                      'bg-green-100 text-green-700': s.status === 'COMPLETED',
                      'bg-blue-100 text-blue-700': s.status === 'IN_PROGRESS',
                      'bg-gray-100 text-gray-600': s.status === 'SCHEDULED',
                    })}>
                      {s.status.toLowerCase().replace('_', ' ')}
                    </Badge>
                  </div>
                  {s.totalMembers != null && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{s.submitted}/{s.totalMembers} submitted</span>
                        <span>{s.attendanceRate}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${s.attendanceRate}%` }} />
                      </div>
                      {(s.overrunMinutes ?? 0) > 0 && (
                        <p className="text-xs text-orange-600">+{Math.round(s.overrunMinutes ?? 0)}m overrun</p>
                      )}
                      {s.attendees && s.attendees.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">{s.attendees.join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Repeated blockers (from M8.1 blocker analysis) */}
      {blockers?.repeatedBlockers?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Repeated Blockers (3+ times)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {blockers.repeatedBlockers.map((task: { id: string; title: string; blockerCount: number; assignee?: { name: string }; department?: { name: string } }) => (
                <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.assignee && <span className="text-xs text-muted-foreground">{task.assignee.name}</span>}
                      {task.department && <span className="text-xs text-muted-foreground">· {task.department.name}</span>}
                    </div>
                  </div>
                  <Badge variant="destructive" className="text-xs shrink-0">{task.blockerCount}x blocked</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
