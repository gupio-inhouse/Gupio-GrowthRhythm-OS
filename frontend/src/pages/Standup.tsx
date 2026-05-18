import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Zap, CheckCircle2, AlertTriangle, Circle, Clock, Edit2, Check, X, Plus, Video } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

type StandupCard = {
  id: string; userId: string; status: string;
  yesterdaySummary?: string; todayCommitments?: string; blockers?: string;
  user: { id: string; name: string; role: string; avatarUrl?: string };
};

const BLOCKER_TYPES = [
  { value: 'APPROVAL', label: 'Awaiting Approval' },
  { value: 'CLIENT', label: 'Client Dependency' },
  { value: 'DEPENDENCY', label: 'Technical Dependency' },
  { value: 'RESOURCE', label: 'Resource Unavailable' },
  { value: 'UNCLEAR_REQUIREMENT', label: 'Unclear Requirement' },
  { value: 'SYSTEM_ISSUE', label: 'System / Tool Issue' },
  { value: 'OTHER', label: 'Other' },
] as const;
type BlockerType = typeof BLOCKER_TYPES[number]['value'];

type StandupSummary = {
  id: string; status: string; scheduledAt: string;
  timerMinutes: number; overrunMinutes?: number;
  meetUrl?: string;
  department: { id: string; name: string; slug: string };
  _count: { cards: number };
};

type StandupDetail = StandupSummary & {
  startedAt?: string;
  endedAt?: string;
  meetUrl?: string;
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
  const { user } = useAuthStore();
  const [activeStandupId, setActiveStandupId] = useState<string | null>(null);

  const { data: standups = [] } = useQuery<StandupSummary[]>({
    queryKey: ['standups'],
    queryFn: () => api.get('/standups').then((r) => r.data),
  });

  // Fetch full detail (with cards) for the active standup
  const activeId = activeStandupId || standups.find((s) => s.status === 'IN_PROGRESS')?.id || null;

  const { data: activeStandup } = useQuery<StandupDetail>({
    queryKey: ['standup', activeId],
    queryFn: () => api.get(`/standups/${activeId}`).then((r) => r.data),
    enabled: !!activeId,
    refetchInterval: (query) => query.state.data?.status === 'IN_PROGRESS' ? 10000 : false,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/standups/${id}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['standups'] });
      qc.invalidateQueries({ queryKey: ['standup', activeId] });
    },
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.post(`/standups/${id}/end`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['standups'] });
      qc.invalidateQueries({ queryKey: ['standup', activeId] });
    },
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
      {activeId && activeStandup ? (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-lg">{activeStandup.department.name} Standup</CardTitle>
                {activeStandup.meetUrl && (
                  <a
                    href={activeStandup.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 mt-1 font-medium"
                  >
                    <Video className="h-3.5 w-3.5" />
                    {activeStandup.meetUrl.includes('meet.google.com') ? 'Join Google Meet' : 'Join Jitsi Meet'}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3">
                {activeStandup.status === 'IN_PROGRESS' && activeStandup.startedAt && (
                  <Timer startedAt={activeStandup.startedAt} limit={activeStandup.timerMinutes} />
                )}
                {activeStandup.meetUrl && (
                  <Button size="sm" variant="outline" asChild className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50">
                    <a href={activeStandup.meetUrl} target="_blank" rel="noopener noreferrer">
                      <Video className="h-3.5 w-3.5" />
                      {activeStandup.meetUrl.includes('meet.google.com') ? 'Google Meet' : 'Jitsi Meet'}
                    </a>
                  </Button>
                )}
                {activeStandup.status === 'SCHEDULED' ? (
                  <Button onClick={() => startMutation.mutate(activeStandup.id)} className="gap-2" disabled={startMutation.isPending}>
                    <Play className="h-4 w-4" /> Start
                  </Button>
                ) : activeStandup.status === 'IN_PROGRESS' ? (
                  <Button variant="destructive" onClick={() => endMutation.mutate(activeStandup.id)} className="gap-2" disabled={endMutation.isPending}>
                    <Square className="h-4 w-4" /> End
                  </Button>
                ) : (
                  <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3" /> Completed
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeStandup.cards.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No standup cards for this session.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeStandup.cards.map((card) => (
                  <StandupCardView
                    key={card.id}
                    card={card}
                    standupId={activeStandup.id}
                    standupStatus={activeStandup.status}
                    departmentId={activeStandup.department.id}
                    currentUserId={user?.id}
                    currentUserRole={user?.role}
                    onSaved={() => qc.invalidateQueries({ queryKey: ['standup', activeId] })}
                  />
                ))}
              </div>
            )}
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
              className={cn('cursor-pointer hover:shadow-sm transition-shadow', activeId === s.id && 'ring-2 ring-primary')}
              onClick={() => setActiveStandupId(s.id === activeStandupId ? null : s.id)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium">{s.department.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(s.scheduledAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}{s._count.cards} participants
                  </p>
                  {s.meetUrl && s.status !== 'COMPLETED' && (
                    <a
                      href={s.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Video className="h-3 w-3" />
                      {s.meetUrl.includes('meet.google.com') ? 'Google Meet' : 'Jitsi Meet'}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {s.overrunMinutes && s.overrunMinutes > 0 && (
                    <Badge variant="outline" className="gap-1 text-xs text-orange-600 border-orange-200">
                      <Clock className="h-3 w-3" />+{Math.round(s.overrunMinutes)}m over
                    </Badge>
                  )}
                  <Badge className={cn('text-xs', {
                    'bg-green-100 text-green-700 border-green-200': s.status === 'COMPLETED',
                    'bg-blue-100 text-blue-700 border-blue-200': s.status === 'IN_PROGRESS',
                    'bg-gray-100 text-gray-600': s.status === 'SCHEDULED',
                  })}>
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

// ── Card component with inline edit ──────────────────────────────────────────

function StandupCardView({
  card, standupId, standupStatus, departmentId, currentUserId, currentUserRole, onSaved,
}: {
  card: StandupCard;
  standupId: string;
  standupStatus: string;
  departmentId: string;
  currentUserId?: string;
  currentUserRole?: string;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [logBlockerOpen, setLogBlockerOpen] = useState(false);
  const [yesterday, setYesterday] = useState(card.yesterdaySummary || '');
  const [today, setToday] = useState(card.todayCommitments || '');
  const [blockers, setBlockers] = useState(card.blockers || '');
  const [saving, setSaving] = useState(false);

  const isOwn = card.userId === currentUserId;
  const canEdit = isOwn && standupStatus === 'IN_PROGRESS';
  const hasBlocker = card.blockers && card.blockers.trim().length > 0;
  const canLogTask = hasBlocker && ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(currentUserRole || '');

  const handleSave = async () => {
    setSaving(true);
    await api.patch(`/standups/${standupId}/cards/${card.id}`, {
      yesterdaySummary: yesterday,
      todayCommitments: today,
      blockers,
    });
    setSaving(false);
    setEditing(false);
    onSaved();
  };

  const handleCancel = () => {
    setYesterday(card.yesterdaySummary || '');
    setToday(card.todayCommitments || '');
    setBlockers(card.blockers || '');
    setEditing(false);
  };

  return (
    <div className={cn('rounded-lg border p-4 bg-white space-y-3', hasBlocker && !editing && 'border-red-200')}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(card.user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{card.user.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{card.user.role.toLowerCase().replace(/_/g, ' ')}</p>
        </div>
        <div className="flex items-center gap-1">
          {card.status === 'SUBMITTED' ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <Circle className="h-4 w-4 text-gray-300" />
          )}
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="ml-1 text-muted-foreground hover:text-foreground">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        /* Edit mode */
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Yesterday</Label>
            <Textarea
              value={yesterday}
              onChange={(e) => setYesterday(e.target.value)}
              placeholder="What did you complete?"
              rows={2}
              className="mt-1 text-sm resize-none"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Today</Label>
            <Textarea
              value={today}
              onChange={(e) => setToday(e.target.value)}
              placeholder="What will you work on?"
              rows={2}
              className="mt-1 text-sm resize-none"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Blockers (leave blank if none)</Label>
            <Textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Any impediments?"
              rows={2}
              className="mt-1 text-sm resize-none"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="gap-1" onClick={handleSave} disabled={saving}>
              <Check className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Submit'}
            </Button>
            <Button size="sm" variant="ghost" className="gap-1" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* View mode */
        <>
          {card.yesterdaySummary ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Yesterday</p>
              <p className="text-sm">{card.yesterdaySummary}</p>
            </div>
          ) : isOwn && standupStatus === 'IN_PROGRESS' ? (
            <button
              onClick={() => setEditing(true)}
              className="w-full text-left text-sm text-muted-foreground border border-dashed rounded p-2 hover:border-primary hover:text-foreground transition-colors"
            >
              Click to fill in your standup...
            </button>
          ) : null}

          {card.todayCommitments && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Today</p>
              <p className="text-sm">{card.todayCommitments}</p>
            </div>
          )}

          {hasBlocker && (
            <div className="bg-red-50 rounded p-2">
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  <p className="text-xs font-medium text-red-600">Blocker</p>
                </div>
                {canLogTask && (
                  <button
                    onClick={() => setLogBlockerOpen(true)}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-100 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Log Task
                  </button>
                )}
              </div>
              <p className="text-sm text-red-800">{card.blockers}</p>
            </div>
          )}
        </>
      )}

      {logBlockerOpen && (
        <BlockerTaskDialog
          open={logBlockerOpen}
          blockerText={card.blockers || ''}
          assigneeUserId={card.userId}
          departmentId={departmentId}
          onClose={() => setLogBlockerOpen(false)}
          onCreated={() => { setLogBlockerOpen(false); qc.invalidateQueries({ queryKey: ['tasks'] }); }}
        />
      )}
    </div>
  );
}

// ── Create task from standup blocker ─────────────────────────────────────────

function BlockerTaskDialog({
  open, blockerText, assigneeUserId, departmentId, onClose, onCreated,
}: {
  open: boolean;
  blockerText: string;
  assigneeUserId: string;
  departmentId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState(blockerText.slice(0, 120));
  const [blockerType, setBlockerType] = useState<BlockerType>('OTHER');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/tasks', {
        title: title.trim(),
        assigneeUserId,
        departmentId,
        status: 'BLOCKED',
        blockerType,
        priority: 'HIGH',
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-4 w-4" /> Log Blocker as Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Task Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Describe the blocked work..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Blocker Type</Label>
            <Select value={blockerType} onValueChange={(v) => setBlockerType(v as BlockerType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BLOCKER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleCreate} disabled={saving || !title.trim()}>
            {saving ? 'Creating...' : 'Create Blocked Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
