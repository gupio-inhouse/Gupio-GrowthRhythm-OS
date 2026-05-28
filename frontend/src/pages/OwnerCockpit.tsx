import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, CheckSquare, Users, Building2, TrendingUp, Zap, Clock, Target, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

function LinkedCard({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link to={to} className="block">
      <Card className={cn('hover:shadow-md hover:border-primary/40 transition-all cursor-pointer', className)}>
        {children}
      </Card>
    </Link>
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

export default function OwnerCockpit() {
  const navigate = useNavigate();
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
      <div className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
  const hasSetupData = (data?.departments?.length || 0) > 0 || (data?.totalUsers || 0) > 0 || goalsCount(data) > 0;

  function goalsCount(payload: { kras?: unknown[] } | undefined) {
    return payload?.kras?.length || 0;
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-blue-500" />
            Owner Cockpit
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Company-wide execution overview</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/team?create=team">Add Team</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/departments?create=department">Add Department</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/goals?create=kra">Add KRA</Link>
          </Button>
          <Button asChild>
            <Link to="/goals?create=goal">Add Goal</Link>
          </Button>
        </div>
      </div>

      {!hasSetupData && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-5 space-y-3">
            <p className="font-medium">Your workspace is ready for setup</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>1. Add a department so work has a clear home.</p>
              <p>2. Invite managers or team members into that department.</p>
              <p>3. Create goals and KRAs so task execution can roll up into outcomes.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/departments?create=department">Add Department</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/team">Invite People</Link>
              </Button>
              <Button asChild>
                <Link to="/goals?create=goal">Create First Goal</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Users', value: data?.activeUsers || 0, sub: `of ${data?.totalUsers || 0}`, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50', to: '/team' },
          { label: 'Departments', value: data?.departments?.length || 0, sub: 'active', icon: Building2, color: 'text-purple-500', bg: 'bg-purple-50', to: '/departments' },
          { label: 'Task Health', value: `${taskHealth}%`, sub: `${data?.tasks?.done || 0} done of ${data?.tasks?.total || 0}`, icon: CheckSquare, color: 'text-green-500', bg: 'bg-green-50', to: '/tasks' },
          { label: 'Blockers', value: data?.tasks?.blocked || 0, sub: 'need resolution', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', to: '/tasks?status=BLOCKED' },
        ].map(({ label, value, sub, icon: Icon, color, bg, to }) => (
          <LinkedCard key={label} to={to}>
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
          </LinkedCard>
        ))}
      </div>

      {/* Weekly summary */}
      {weekly && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Completed this week', value: weekly.completedThisWeek, color: 'text-green-600', to: '/tasks?status=DONE' },
            { label: 'New blockers', value: weekly.newBlockers, color: 'text-red-600', to: '/tasks?status=BLOCKED' },
            { label: 'Standups held', value: weekly.standupCount, color: 'text-blue-600', to: '/standup' },
            { label: 'Learning completed', value: weekly.learnCompletions, color: 'text-purple-600', to: '/learning' },
          ].map(({ label, value, color, to }) => (
            <LinkedCard key={label} to={to} className="bg-muted/40">
              <CardContent className="p-4 text-center">
                <p className={cn('text-2xl font-bold', color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </LinkedCard>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department bar chart */}
        <LinkedCard to="/departments">
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
        </LinkedCard>

        {/* Blocker breakdown */}
        <LinkedCard to="/tasks?status=BLOCKED">
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
        </LinkedCard>
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
                return (
                  <Link key={kra.id} to="/goals" className="block rounded-lg p-2 -mx-2 hover:bg-muted/50 transition-colors">
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
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Department Activity Snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Department Activity Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(data?.departments || []).map((dept: Department) => {
              return (
                <Link
                  key={dept.id}
                  to={dept.slug ? `/dashboard/${dept.slug}` : '/departments'}
                  className="flex items-center gap-4 rounded-lg -mx-2 px-2 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-36 shrink-0">
                    <p className="text-sm font-medium truncate">{dept.name}</p>
                    <p className="text-xs text-muted-foreground">{dept._count.users} people · {dept._count.tasks} tasks</p>
                  </div>
                  <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {dept._count.kras} KRAs tracking execution across {dept._count.tasks} active task records
                  </div>
                  {dept.slug && (
                    <span
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title={`View ${dept.name} dashboard`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </span>
                  )}
                </Link>
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
                overrunMinutes?: number; attendees?: Array<{ id: string; name: string }>;
              }) => (
                <div
                  key={s.id ?? s.departmentName}
                  className="block rounded-lg border p-3 space-y-2 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate('/standup')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate('/standup');
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
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
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {s.attendees.map((attendee) => (
                            <Link
                              key={attendee.id}
                              to={`/team/${attendee.id}/report`}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              className="text-xs text-primary hover:underline"
                            >
                              {attendee.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom widgets grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResourceCapacityCard />

        {/* Repeated blockers (from M8.1 blocker analysis) */}
        {blockers?.repeatedBlockers?.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Repeated Blockers (3+ times)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {blockers.repeatedBlockers.map((task: { id: string; title: string; blockerCount: number; assignee?: { id: string; name: string }; department?: { name: string } }) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100 hover:bg-red-100/70 transition-colors cursor-pointer"
                    onClick={() => navigate(`/tasks?status=BLOCKED&taskId=${task.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/tasks?status=BLOCKED&taskId=${task.id}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.assignee && (
                          <Link
                            to={`/team/${task.assignee.id}/report`}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="text-xs text-primary hover:underline"
                          >
                            {task.assignee.name}
                          </Link>
                        )}
                        {task.department && <span className="text-xs text-muted-foreground">· {task.department.name}</span>}
                      </div>
                    </div>
                    <Badge variant="destructive" className="text-xs shrink-0">{task.blockerCount}x blocked</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-dashed bg-muted/10 flex flex-col items-center justify-center text-center p-6 min-h-[220px]">
            <CheckSquare className="h-8 w-8 mb-2 text-emerald-500 opacity-60" />
            <p className="text-sm font-medium">No Repeated Blockers</p>
            <p className="text-xs text-muted-foreground">No tasks have been blocked 3+ times.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
