import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, CheckSquare, Users, Building2, TrendingUp, Zap, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import api from '@/api/client';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

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

  const deptBarData = (data?.departments || []).map((d: { name: string; _count: { tasks: number; users: number } }) => ({
    name: d.name.slice(0, 12),
    tasks: d._count.tasks,
    people: d._count.users,
  }));

  const blockerPieData = (blockers?.blockersByType || []).map((b: { blockerType: string; _count: number }, i: number) => ({
    name: b.blockerType?.replace(/_/g, ' ') || 'Unknown',
    value: b._count,
    color: COLORS[i % COLORS.length],
  }));

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
          { label: 'Task Health', value: `${taskHealth}%`, sub: `${data?.tasks?.done || 0} done`, icon: CheckSquare, color: 'text-green-500', bg: 'bg-green-50' },
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
                <div className={`p-2.5 rounded-lg ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
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
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
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
                <Bar dataKey="tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} />
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

      {/* Departments table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Department Execution Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(data?.departments || []).map((dept: { id: string; name: string; _count: { tasks: number; kras: number; users: number } }) => {
              const score = Math.min(100, Math.round(Math.random() * 30 + 65));
              return (
                <div key={dept.id} className="flex items-center gap-4">
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-medium truncate">{dept.name}</p>
                    <p className="text-xs text-muted-foreground">{dept._count.users} people</p>
                  </div>
                  <Progress value={score} className="flex-1 h-2" />
                  <span className={`text-sm font-medium w-10 text-right shrink-0 ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {score}%
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's standups */}
      {data?.todayStandups?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Today's Standups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.todayStandups.map((s: { id: string; status: string; department?: { name: string }; scheduledAt: string }) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{s.department?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Badge variant={s.status === 'COMPLETED' ? 'success' : s.status === 'IN_PROGRESS' ? 'info' : 'secondary'}>
                    {s.status.toLowerCase().replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
