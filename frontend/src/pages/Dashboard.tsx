import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { CheckSquare, AlertTriangle, Zap, TrendingUp, Users, Clock, Target, BookOpen, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/store/authStore';
import { cn, kraStatusColor, formatDate } from '@/lib/utils';
import api from '@/api/client';

function StatCard({ title, value, icon: Icon, color, bg, subtitle }: {
  title: string; value: string | number; icon: React.ElementType;
  color: string; bg: string; subtitle?: string;
}) {
  return (
    <Card>
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
      <div className="p-8 grid grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{dept?.name || slug} Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Department execution overview</p>
      </div>

      {/* Widget row 1: task counts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
        <StatCard title="Overdue Tasks" value={dash.overdueCount} icon={Clock} color="text-red-500" bg="bg-red-50"
          subtitle="Past due date" />
        <StatCard title="Blocked Today" value={dash.blockedCount} icon={AlertTriangle} color="text-orange-500" bg="bg-orange-50"
          subtitle="Need resolution" />
        <StatCard title="Due Today" value={dash.dueTodayCount} icon={Calendar} color="text-blue-500" bg="bg-blue-50"
          subtitle="Pending tasks" />
      </div>

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
                  const pct = kra.target > 0 ? Math.round((kra.current / kra.target) * 100) : 0;
                  return (
                    <div key={kra.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate flex-1 mr-4">{kra.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={cn('text-xs border', kraStatusColor(kra.status))}>{kra.status.replace('_', ' ')}</Badge>
                          <span className="text-xs text-muted-foreground">{kra.current}/{kra.target}{kra.unit ? ` ${kra.unit}` : ''}</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Widget 5: Team */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Team ({dept?.users.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(dept?.users || []).slice(0, 8).map((member) => (
                <div key={member.id} className="flex items-center gap-2">
                  <div className={cn('h-2 w-2 rounded-full shrink-0', member.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300')} />
                  <span className="text-sm flex-1 truncate">{member.name}</span>
                  <span className="text-xs text-muted-foreground capitalize shrink-0">{member.role.toLowerCase().replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
              { label: 'Total Tasks', value: dept?._count.tasks || 0, color: 'text-foreground' },
              { label: 'Overdue', value: dash.overdueCount, color: 'text-red-600' },
              { label: 'Blocked', value: dash.blockedCount, color: 'text-orange-600' },
              { label: 'Due Today', value: dash.dueTodayCount, color: 'text-blue-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-4 rounded-lg bg-muted/40">
                <p className={cn('text-2xl font-bold', color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
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
  const { user } = useAuthStore();

  // If a department slug is in the URL, show department dashboard
  if (slug) return <DepartmentDashboard slug={slug} />;

  const { data: cockpit } = useQuery({
    queryKey: ['cockpit'],
    queryFn: () => api.get('/owner/cockpit').then((r) => r.data),
    enabled: ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || ''),
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
  });

  const myTasks = tasks || [];
  const dueTodayTasks = myTasks.filter((t: { dueDate?: string; status: string }) => {
    if (!t.dueDate || t.status === 'DONE') return false;
    const d = new Date(t.dueDate);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const blockedTasks = myTasks.filter((t: { status: string }) => t.status === 'BLOCKED');

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Owner stats */}
      {cockpit && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Active Users" value={cockpit.activeUsers} icon={Users} color="text-white" bg="bg-blue-500"
            subtitle={`of ${cockpit.totalUsers} total`} />
          <StatCard title="Tasks Done" value={cockpit.tasks?.done || 0} icon={CheckSquare} color="text-white" bg="bg-green-500"
            subtitle={`of ${cockpit.tasks?.total || 0} total`} />
          <StatCard title="Overdue Tasks" value={cockpit.tasks?.overdue || 0} icon={Clock} color="text-white" bg="bg-orange-500" />
          <StatCard title="Blocked" value={cockpit.tasks?.blocked || 0} icon={AlertTriangle} color="text-white" bg="bg-red-500" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My tasks today */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-blue-500" />
              My Tasks Today
              <Badge variant="secondary" className="ml-auto">{dueTodayTasks.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dueTodayTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No tasks due today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dueTodayTasks.slice(0, 8).map((task: { id: string; title: string; status: string; priority: string; kra?: { name: string } }) => (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className={cn('mt-0.5 h-2 w-2 rounded-full shrink-0', {
                      'bg-red-500': task.status === 'BLOCKED',
                      'bg-blue-500': task.status === 'IN_PROGRESS',
                      'bg-gray-300': task.status === 'TODO',
                    })} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.kra && <p className="text-xs text-muted-foreground">KRA: {task.kra.name}</p>}
                    </div>
                    <Badge className={cn('shrink-0 text-xs border', {
                      'bg-red-50 text-red-700 border-red-200': task.priority === 'CRITICAL',
                      'bg-orange-50 text-orange-700 border-orange-200': task.priority === 'HIGH',
                      'bg-yellow-50 text-yellow-700 border-yellow-200': task.priority === 'MEDIUM',
                      'bg-gray-50 text-gray-700': task.priority === 'LOW',
                    })}>
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Blockers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Blockers
              <Badge variant={blockedTasks.length > 0 ? 'destructive' : 'secondary'} className="ml-auto">
                {blockedTasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {blockedTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No blockers — great!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedTasks.slice(0, 5).map((task: { id: string; title: string; blockerType?: string }) => (
                  <div key={task.id} className="p-2.5 rounded-md bg-red-50 border border-red-100">
                    <p className="text-sm font-medium text-red-900 truncate">{task.title}</p>
                    {task.blockerType && (
                      <p className="text-xs text-red-500 mt-0.5 capitalize">{task.blockerType.toLowerCase().replace(/_/g, ' ')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
                const pct = kra.target > 0 ? Math.round((kra.current / kra.target) * 100) : 0;
                return (
                  <div key={kra.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium truncate">{kra.name}</p>
                        {kra.department && <p className="text-xs text-muted-foreground">{kra.department.name}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn('text-xs border', kraStatusColor(kra.status))}>{kra.status.replace('_', ' ')}</Badge>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
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
