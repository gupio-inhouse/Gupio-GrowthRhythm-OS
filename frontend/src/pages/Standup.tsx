import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Zap, CheckCircle2, AlertTriangle, Circle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import api from '@/api/client';

type StandupCard = {
  id: string; userId: string; status: string;
  yesterdaySummary?: string; todayCommitments?: string; blockers?: string;
  user: { name: string; role: string };
};

type Standup = {
  id: string; status: string; startedAt?: string;
  timerMinutes: number; overrunMinutes?: number;
  department: { name: string; slug: string };
  cards: StandupCard[];
};

function Timer({ startedAt, limit }: { startedAt: string; limit: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const over = elapsed > limit * 60;

  return (
    <div className={cn('text-4xl font-mono font-bold tabular-nums', over ? 'text-red-500 animate-pulse' : 'text-blue-600')}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      {over && <span className="text-sm ml-2">OVER</span>}
    </div>
  );
}

export default function Standup() {
  const qc = useQueryClient();
  const [activeStandupId, setActiveStandupId] = useState<string | null>(null);

  const { data: standups = [] } = useQuery<Standup[]>({
    queryKey: ['standups'],
    queryFn: () => api.get('/standups').then((r) => r.data),
  });

  const activeStandup = activeStandupId ? standups.find((s) => s.id === activeStandupId) : standups.find((s) => s.status === 'IN_PROGRESS');

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/standups/${id}/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['standups'] }),
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.post(`/standups/${id}/end`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['standups'] }),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-500" />
            Daily Standup
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">15-minute daily operating ritual</p>
        </div>
      </div>

      {/* Active standup panel */}
      {activeStandup ? (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{activeStandup.department.name} Standup</CardTitle>
              <div className="flex items-center gap-3">
                {activeStandup.status === 'IN_PROGRESS' && activeStandup.startedAt && (
                  <Timer startedAt={activeStandup.startedAt} limit={activeStandup.timerMinutes} />
                )}
                {activeStandup.status === 'SCHEDULED' ? (
                  <Button onClick={() => startMutation.mutate(activeStandup.id)} className="gap-2">
                    <Play className="h-4 w-4" /> Start
                  </Button>
                ) : activeStandup.status === 'IN_PROGRESS' ? (
                  <Button variant="destructive" onClick={() => endMutation.mutate(activeStandup.id)} className="gap-2">
                    <Square className="h-4 w-4" /> End
                  </Button>
                ) : (
                  <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeStandup.cards.map((card) => (
                <StandupCardView key={card.id} card={card} />
              ))}
              {activeStandup.cards.length === 0 && (
                <p className="text-muted-foreground text-sm col-span-3 py-4">No standup cards yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No active standup. Select one from below to start.</p>
          </CardContent>
        </Card>
      )}

      {/* All standups list */}
      <div>
        <h2 className="text-base font-semibold mb-3">Recent Standups</h2>
        <div className="space-y-2">
          {standups.map((s) => (
            <Card
              key={s.id}
              className={cn('cursor-pointer hover:shadow-sm transition-shadow', activeStandupId === s.id && 'ring-2 ring-primary')}
              onClick={() => setActiveStandupId(s.id === activeStandupId ? null : s.id)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium">{s.department.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.cards.length} participants</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.overrunMinutes && s.overrunMinutes > 0 && (
                    <Badge variant="warning" className="gap-1 text-xs">
                      <Clock className="h-3 w-3" />+{Math.round(s.overrunMinutes)}m over
                    </Badge>
                  )}
                  <Badge variant={
                    s.status === 'COMPLETED' ? 'success' :
                    s.status === 'IN_PROGRESS' ? 'info' : 'secondary'
                  }>
                    {s.status.toLowerCase().replace('_', ' ')}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {standups.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">No standups scheduled yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StandupCardView({ card }: { card: StandupCard }) {
  const hasBlocker = card.blockers && card.blockers.trim().length > 0;
  return (
    <div className={cn('rounded-lg border p-4 bg-white space-y-3', hasBlocker && 'border-red-200')}>
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(card.user.name)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{card.user.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{card.user.role.toLowerCase().replace('_', ' ')}</p>
        </div>
        <div className="ml-auto">
          {card.status === 'SUBMITTED' ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <Circle className="h-4 w-4 text-gray-300" />
          )}
        </div>
      </div>

      {card.yesterdaySummary && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Yesterday</p>
          <p className="text-sm">{card.yesterdaySummary}</p>
        </div>
      )}

      {card.todayCommitments && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Today</p>
          <p className="text-sm">{card.todayCommitments}</p>
        </div>
      )}

      {hasBlocker && (
        <div className="bg-red-50 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle className="h-3 w-3 text-red-500" />
            <p className="text-xs font-medium text-red-600">Blocker</p>
          </div>
          <p className="text-sm text-red-800">{card.blockers}</p>
        </div>
      )}
    </div>
  );
}
