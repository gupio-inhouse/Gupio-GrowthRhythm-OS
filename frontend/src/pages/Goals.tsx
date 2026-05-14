import { useQuery } from '@tanstack/react-query';
import { Target, Plus, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, kraStatusColor } from '@/lib/utils';
import api from '@/api/client';

type Goal = {
  id: string; title: string; type: string; status: string;
  target?: number; current?: number; unit?: string; period?: string;
  owner: { name: string; avatarUrl?: string };
  _count: { kras: number; subGoals: number };
};

type KRA = {
  id: string; name: string; status: string; target: number; current: number;
  unit?: string; period: string;
  owner: { name: string; avatarUrl?: string };
  department: { name: string };
  _count: { tasks: number };
};

export default function Goals() {
  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data),
  });

  const { data: kras = [] } = useQuery<KRA[]>({
    queryKey: ['kras'],
    queryFn: () => api.get('/kras').then((r) => r.data),
  });

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-500" />
            Goals & KRAs
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{goals.length} goals · {kras.length} KRAs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Add KRA</Button>
          <Button className="gap-2"><Plus className="h-4 w-4" /> Add Goal</Button>
        </div>
      </div>

      {/* Goals */}
      {goals.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Company Goals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map((goal) => {
              const pct = goal.target && goal.current != null ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
              return (
                <Card key={goal.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-medium">{goal.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{goal.period || 'Ongoing'}</p>
                      </div>
                      <Badge variant={goal.status === 'ACTIVE' ? 'info' : goal.status === 'COMPLETED' ? 'success' : 'secondary'}>
                        {goal.status.toLowerCase()}
                      </Badge>
                    </div>
                    {goal.target != null && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{goal.current?.toLocaleString()} {goal.unit}</span>
                          <span>{goal.target.toLocaleString()} {goal.unit}</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                        <p className="text-xs text-right text-muted-foreground">{pct}% achieved</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={goal.owner.avatarUrl} />
                        <AvatarFallback className="text-xs">{getInitials(goal.owner.name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">{goal.owner.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{goal._count.kras} KRAs</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* KRAs */}
      <div>
        <h2 className="text-base font-semibold mb-3">Key Result Areas</h2>
        <div className="space-y-3">
          {kras.map((kra) => {
            const pct = Math.min(100, Math.round((kra.current / kra.target) * 100));
            return (
              <Card key={kra.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <p className="font-medium">{kra.name}</p>
                        <Badge className={`text-xs ${kraStatusColor(kra.status)}`}>{kra.status.toLowerCase().replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{kra.department.name} · {kra.period}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex-1">
                          <Progress value={pct} className="h-1.5" />
                        </div>
                        <span className="text-sm font-medium shrink-0 w-20 text-right">
                          {kra.current.toLocaleString()} / {kra.target.toLocaleString()} {kra.unit}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={kra.owner.avatarUrl} />
                        <AvatarFallback className="text-xs bg-blue-50 text-blue-700">{getInitials(kra.owner.name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">{kra._count.tasks} tasks</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {kras.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No KRAs created yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
