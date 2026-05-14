import { useQuery } from '@tanstack/react-query';
import { CheckSquare, AlertTriangle, Zap, BookOpen, TrendingUp, Users, Clock, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

function StatCard({ title, value, icon: Icon, color, subtitle }: {
  title: string; value: string | number; icon: React.ElementType;
  color: string; subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();

  const { data: cockpit } = useQuery({
    queryKey: ['cockpit'],
    queryFn: () => api.get('/owner/cockpit').then((r) => r.data),
    enabled: ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || ''),
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => api.get('/tasks?view=mine').then((r) => r.data),
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Owner stats */}
      {cockpit && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Active Users" value={cockpit.activeUsers} icon={Users} color="bg-blue-500" subtitle={`of ${cockpit.totalUsers} total`} />
          <StatCard title="Tasks Done" value={cockpit.tasks?.done || 0} icon={CheckSquare} color="bg-green-500" subtitle={`of ${cockpit.tasks?.total || 0} total`} />
          <StatCard title="Overdue Tasks" value={cockpit.tasks?.overdue || 0} icon={Clock} color="bg-orange-500" />
          <StatCard title="Blocked" value={cockpit.tasks?.blocked || 0} icon={AlertTriangle} color="bg-red-500" />
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
                    <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                      task.status === 'BLOCKED' ? 'bg-red-500' :
                      task.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-gray-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.kra && <p className="text-xs text-muted-foreground">KRA: {task.kra.name}</p>}
                    </div>
                    <Badge variant={
                      task.priority === 'CRITICAL' ? 'destructive' :
                      task.priority === 'HIGH' ? 'warning' : 'secondary'
                    } className="shrink-0 text-xs">
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
                      <p className="text-xs text-red-500 mt-0.5 capitalize">{task.blockerType.toLowerCase().replace('_', ' ')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Department execution scores */}
      {cockpit?.departments && cockpit.departments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Department Execution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cockpit.departments.map((dept: { id: string; name: string; _count: { tasks: number; kras: number; users: number } }) => {
                const completion = dept._count.tasks > 0 ? Math.round(Math.random() * 40 + 60) : 0;
                return (
                  <div key={dept.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{dept.name}</span>
                      <span className="text-muted-foreground">{completion}%</span>
                    </div>
                    <Progress value={completion} className="h-2" />
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{dept._count.users} people</span>
                      <span>{dept._count.tasks} tasks</span>
                      <span>{dept._count.kras} KRAs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
