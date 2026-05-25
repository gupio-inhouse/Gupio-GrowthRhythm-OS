import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Zap, CheckCircle2, AlertTriangle, Circle, Clock, Edit2, Check, X, Plus, Video, Trash2 } from 'lucide-react';
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

type Department = { id: string; name: string; standupTime?: string; standupDuration?: number; standupMeetUrl?: string };

function DailyScheduleCard({ dept, onUpdated }: { dept: Department; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(dept.standupTime || '09:00');
  const [duration, setDuration] = useState(String(dept.standupDuration ?? 15));
  const [meetUrl, setMeetUrl] = useState(dept.standupMeetUrl || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/departments/${dept.id}`, {
        standupTime: time,
        standupDuration: parseInt(duration, 10) || 15,
        standupMeetUrl: meetUrl.trim() || null,
      });
      onUpdated();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={dept.standupTime ? 'border-green-200 bg-green-50/40' : 'border-orange-200 bg-orange-50/40'}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${dept.standupTime ? 'bg-green-100' : 'bg-orange-100'}`}>
              <Clock className={`h-4 w-4 ${dept.standupTime ? 'text-green-600' : 'text-orange-500'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold">{dept.name} — Daily Standup</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {dept.standupTime
                  ? `Every day at ${dept.standupTime} · ${dept.standupDuration ?? 15} min${dept.standupMeetUrl ? ' · link set ✓' : ' · no link'}`
                  : 'No daily schedule set — standup cards won\'t be created automatically'}
              </p>
            </div>
          </div>
          <Button size="sm" variant={dept.standupTime ? 'outline' : 'default'} onClick={() => setEditing(true)} className="shrink-0">
            {dept.standupTime ? 'Change Schedule' : 'Set Schedule'}
          </Button>
        </div>

        {editing && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Daily time (IST)</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duration (minutes)</Label>
                <Input type="number" min={5} max={60} value={duration} onChange={(e) => setDuration(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Daily Meeting Link <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                value={meetUrl}
                onChange={(e) => setMeetUrl(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">This link will be used on every auto-created standup for this department.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { user } = useAuthStore();
  const isCeo = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');
  const today = new Date().toISOString().slice(0, 10);

  const [deptId, setDeptId] = useState(user?.departmentId || '');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('09:00');
  const [meetUrl, setMeetUrl] = useState('');
  const [error, setError] = useState('');

  const { data: depts = [] } = useQuery<Department[]>({
    queryKey: ['departments-list'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open && isCeo,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      return api.post('/standups', { departmentId: deptId, scheduledAt, meetUrl: meetUrl.trim() || undefined });
    },
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.response?.data?.error || 'Failed to schedule standup'),
  });

  const handleSubmit = () => {
    setError('');
    if (!deptId) { setError('Select a department'); return; }
    if (!date) { setError('Pick a date'); return; }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule Standup</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isCeo && (
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {!isCeo && user?.departmentId && (
            <div className="space-y-1.5">
              <Label>Department</Label>
              <p className="text-sm font-medium px-3 py-2 bg-muted rounded-md text-muted-foreground">
                Your department
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Meeting Link <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Paste any video call link — everyone in the standup will see a Join button.</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Standup() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [activeStandupId, setActiveStandupId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const canSchedule = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canConfigureSchedule = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');

  const { data: depts = [], refetch: refetchDepts } = useQuery<Department[]>({
    queryKey: ['departments-standup-config'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: canConfigureSchedule,
  });

  // For dept head/manager: show only their own department; for CEO/admin: show all
  const schedulableDepts = user?.role === 'DEPARTMENT_HEAD'
    ? depts.filter((d) => d.id === user.departmentId)
    : depts;

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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/standups/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      setActiveStandupId(null);
      qc.invalidateQueries({ queryKey: ['standups'] });
    },
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
    <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-500" />
            Daily Standup
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">15-minute daily operating ritual</p>
        </div>
        {canSchedule && (
          <Button size="sm" className="gap-2" onClick={() => setScheduleOpen(true)}>
            <Plus className="h-4 w-4" />
            Schedule Standup
          </Button>
        )}
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
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-600 mt-1"
                  >
                    <Video className="h-3 w-3" />
                    Google Meet
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3">
                {activeStandup.status === 'IN_PROGRESS' && activeStandup.startedAt && (
                  <Timer startedAt={activeStandup.startedAt} limit={activeStandup.timerMinutes} />
                )}
                {activeStandup.meetUrl ? (
                  <Button size="sm" asChild className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                    <a href={activeStandup.meetUrl} target="_blank" rel="noopener noreferrer">
                      <Video className="h-3.5 w-3.5" />
                      Join Meeting
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild className="gap-1.5 text-muted-foreground">
                    <a href="/integrations">
                      <Video className="h-3.5 w-3.5" />
                      Connect Google Meet
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

      {/* Daily schedule configuration */}
      {canConfigureSchedule && schedulableDepts.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Daily Schedule</h2>
          <div className="space-y-3">
            {schedulableDepts.map((dept) => (
              <DailyScheduleCard key={dept.id} dept={dept} onUpdated={() => refetchDepts()} />
            ))}
          </div>
        </div>
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
                  {s.status !== 'COMPLETED' && (
                    s.meetUrl ? (
                      <a
                        href={s.meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
                      >
                        <Video className="h-3.5 w-3.5" />
                        Join
                      </a>
                    ) : (
                      <a
                        href="/integrations"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dashed text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        <Video className="h-3.5 w-3.5" />
                        Connect Google
                      </a>
                    )
                  )}
                  {canSchedule && s.status !== 'IN_PROGRESS' && (
                    confirmDeleteId === s.id ? (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => deleteMutation.mutate(s.id)}
                          disabled={deleteMutation.isPending}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          {deleteMutation.isPending ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded text-xs font-medium border hover:bg-muted transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                        title="Delete standup"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {standups.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">No standups scheduled yet</p>
          )}
        </div>
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['standups'] })}
      />
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
