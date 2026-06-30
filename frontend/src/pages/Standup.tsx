import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, Square, Zap, CheckCircle2, AlertTriangle, Circle, Clock,
  Edit2, Check, X, Plus, Video, Trash2, Calendar, Users, Timer as TimerIcon,
  ArrowRight, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { toast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────
type StandupCard = {
  id: string; userId: string; status: string;
  yesterdaySummary?: string; todayCommitments?: string; blockers?: string;
  user: { id: string; name: string; role: string; avatarUrl?: string };
};
type StandupSummary = {
  id: string; status: string; scheduledAt: string;
  timerMinutes: number; overrunMinutes?: number;
  meetUrl?: string;
  department: { id: string; name: string; slug: string };
  _count: { cards: number };
};
type StandupDetail = StandupSummary & {
  startedAt?: string; endedAt?: string; cards: StandupCard[];
};
type Department = {
  id: string; name: string; standupTime?: string;
  standupDuration?: number; standupMeetUrl?: string;
};
const BLOCKER_TYPES = [
  { value: 'APPROVAL',             label: 'Awaiting Approval' },
  { value: 'CLIENT',               label: 'Client Dependency' },
  { value: 'DEPENDENCY',           label: 'Technical Dependency' },
  { value: 'RESOURCE',             label: 'Resource Unavailable' },
  { value: 'UNCLEAR_REQUIREMENT',  label: 'Unclear Requirement' },
  { value: 'SYSTEM_ISSUE',         label: 'System / Tool Issue' },
  { value: 'OTHER',                label: 'Other' },
] as const;
type BlockerType = typeof BLOCKER_TYPES[number]['value'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function isToday(dateStr: string) {
  const d = new Date(dateStr), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// ── Live timer ─────────────────────────────────────────────────────────────────
function LiveTimer({ startedAt, limit }: { startedAt: string; limit: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const iv = setInterval(() =>
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const over = elapsed > limit * 60;
  const pct  = Math.min((elapsed / (limit * 60)) * 100, 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn(
        'text-4xl sm:text-5xl font-black tabular-nums font-mono tracking-tight',
        over ? 'text-red-500 animate-pulse' : 'text-white',
      )}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
      <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-1000', over ? 'bg-red-400' : 'bg-white/80')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {over && <span className="text-xs font-bold text-red-300 uppercase tracking-widest">Time Over!</span>}
    </div>
  );
}

// ── Daily schedule card ────────────────────────────────────────────────────────
function DailyScheduleCard({ dept, onUpdated }: { dept: Department; onUpdated: () => void }) {
  const [editing, setEditing]   = useState(false);
  const [time, setTime]         = useState(dept.standupTime || '09:00');
  const [duration, setDuration] = useState(String(dept.standupDuration ?? 15));
  const [meetUrl, setMeetUrl]   = useState(dept.standupMeetUrl || '');
  const [saving, setSaving]     = useState(false);

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

  const configured = !!dept.standupTime;

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      configured ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-green-50/30' : 'border-amber-200 bg-gradient-to-br from-amber-50/60 to-orange-50/30',
    )}>
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4">
        <div className="flex items-center gap-3">
          <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center shadow-sm', configured ? 'bg-gradient-to-br from-emerald-400 to-green-500' : 'bg-gradient-to-br from-amber-400 to-orange-500')}>
            <Clock className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold">{dept.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {configured
                ? `Daily at ${dept.standupTime} · ${dept.standupDuration ?? 15} min${dept.standupMeetUrl ? ' · Meet link set ✓' : ''}`
                : 'No schedule set — meetings won\'t auto-create'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border text-xs font-semibold transition-all shadow-sm',
            configured
              ? 'border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50'
              : 'border-amber-300 text-amber-700 bg-white hover:bg-amber-50',
          )}
        >
          {editing ? <X className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
          {editing ? 'Cancel' : configured ? 'Change' : 'Set Schedule'}
        </button>
      </div>

      {editing && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border/30">
          <div className="grid grid-cols-2 gap-3 pt-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Daily Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-xl text-sm border-border/60" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Duration (min)</Label>
              <Input type="number" min={5} max={60} value={duration} onChange={(e) => setDuration(e.target.value)} className="h-9 rounded-xl text-sm border-border/60" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Meeting Link <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="https://meet.google.com/…" value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} className="h-9 rounded-xl text-sm border-border/60" />
            <p className="text-[10px] text-muted-foreground">Used on every auto-created meeting for this department.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="h-8 px-3 rounded-xl border border-border/60 text-xs text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-8 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 shadow-sm">
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Schedule dialog ────────────────────────────────────────────────────────────
function ScheduleDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuthStore();
  const isCeo  = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');
  const today  = new Date().toISOString().slice(0, 10);
  const [deptId, setDeptId]   = useState(user?.departmentId || '');
  const [date, setDate]       = useState(today);
  const [time, setTime]       = useState('09:00');
  const [meetUrl, setMeetUrl] = useState('');

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
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to schedule meeting'),
  });

  const handleSubmit = () => {
    if (!deptId) { toast.error('Select a department'); return; }
    if (!date)   { toast.error('Pick a date'); return; }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            Schedule Standup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isCeo ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Department</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger className="rounded-xl border-border/60"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : user?.departmentId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Department</Label>
              <div className="h-9 rounded-xl bg-muted/50 border border-border/60 px-3 flex items-center text-sm text-muted-foreground">Your department</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date</Label>
              <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-xl border-border/60 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-xl border-border/60 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Meeting Link <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="https://meet.google.com/…" value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} className="h-9 rounded-xl border-border/60 text-sm" />
            <p className="text-[10px] text-muted-foreground">Everyone in the meeting will see a Join button.</p>
          </div>

        </div>

        <DialogFooter>
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/60 text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="h-9 px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-bold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 shadow-sm">
            {mutation.isPending ? 'Scheduling…' : 'Schedule'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Standup() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [activeStandupId, setActiveStandupId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen]       = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'recent' | 'schedule'>('recent');

  const canSchedule         = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canConfigureSchedule = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');

  const { data: depts = [], refetch: refetchDepts } = useQuery<Department[]>({
    queryKey: ['departments-standup-config'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: canConfigureSchedule,
  });
  const schedulableDepts = user?.role === 'DEPARTMENT_HEAD'
    ? depts.filter((d) => d.id === user.departmentId)
    : depts;

  const { data: standups = [] } = useQuery<StandupSummary[]>({
    queryKey: ['standups'],
    queryFn: () => api.get('/standups').then((r) => r.data),
  });

  const activeId = activeStandupId || standups.find((s) => s.status === 'IN_PROGRESS')?.id || null;

  const { data: activeStandup } = useQuery<StandupDetail>({
    queryKey: ['standup', activeId],
    queryFn: () => api.get(`/standups/${activeId}`).then((r) => r.data),
    enabled: !!activeId,
    refetchInterval: (q) => q.state.data?.status === 'IN_PROGRESS' ? 10000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/standups/${id}`),
    onSuccess: () => { setConfirmDeleteId(null); setActiveStandupId(null); qc.invalidateQueries({ queryKey: ['standups'] }); },
  });
  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/standups/${id}/start`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['standups'] }); qc.invalidateQueries({ queryKey: ['standup', activeId] }); },
  });
  const endMutation = useMutation({
    mutationFn: (id: string) => api.post(`/standups/${id}/end`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['standups'] }); qc.invalidateQueries({ queryKey: ['standup', activeId] }); },
  });

  // Status UI tokens
  const statusConfig = {
    SCHEDULED:   { label: 'Scheduled',   badge: 'bg-slate-100 text-slate-700 border-slate-200',   dot: 'bg-slate-400' },
    IN_PROGRESS: { label: 'Live',        badge: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-500' },
    COMPLETED:   { label: 'Completed',   badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  } as Record<string, { label: string; badge: string; dot: string }>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px] mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-200 shrink-0">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Daily Meeting</h1>
              <p className="text-xs text-muted-foreground mt-0.5">15-minute daily operating ritual</p>
            </div>
          </div>
          {canSchedule && (
            <button
              onClick={() => setScheduleOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold hover:from-indigo-600 hover:to-violet-700 shadow-sm shadow-indigo-200 transition-all"
            >
              <Plus className="h-4 w-4" /> Schedule Meeting
            </button>
          )}
        </div>

        {/* ── Active standup panel ── */}
        {activeId && activeStandup ? (
          <div className={cn(
            'rounded-3xl overflow-hidden shadow-xl',
            activeStandup.status === 'IN_PROGRESS'
              ? 'bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700'
              : activeStandup.status === 'COMPLETED'
              ? 'bg-gradient-to-br from-emerald-500 to-green-600'
              : 'bg-gradient-to-br from-slate-600 to-slate-700',
          )}>
            {/* Top bar */}
            <div className="px-5 sm:px-7 pt-6 pb-5 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">
                  {activeStandup.status === 'IN_PROGRESS' ? '🔴 Live Now' : activeStandup.status === 'COMPLETED' ? '✓ Completed' : '🕐 Scheduled'}
                </p>
                <h2 className="text-white text-xl sm:text-2xl font-black">{activeStandup.department.name} Meeting</h2>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-white/70 text-xs flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(activeStandup.scheduledAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  <span className="text-white/70 text-xs flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {(activeStandup.cards ?? []).length} participants
                  </span>
                  <span className="text-white/70 text-xs flex items-center gap-1">
                    <TimerIcon className="h-3.5 w-3.5" />
                    {activeStandup.timerMinutes} min
                  </span>
                </div>
              </div>

              {/* Timer + controls */}
              <div className="flex flex-col items-end gap-3">
                {activeStandup.status === 'IN_PROGRESS' && activeStandup.startedAt && (
                  <LiveTimer startedAt={activeStandup.startedAt} limit={activeStandup.timerMinutes} />
                )}
                <div className="flex items-center gap-2">
                  {activeStandup.meetUrl && isToday(activeStandup.scheduledAt) && (
                    <a
                      href={activeStandup.meetUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 text-white text-xs font-bold hover:bg-white/30 transition-all"
                    >
                      <Video className="h-3.5 w-3.5" /> Join Meeting
                    </a>
                  )}
                  {canSchedule && (
                    activeStandup.status === 'SCHEDULED' ? (
                      <button
                        onClick={() => startMutation.mutate(activeStandup.id)}
                        disabled={startMutation.isPending}
                        className="inline-flex items-center gap-1.5 h-9 px-5 rounded-xl bg-white text-indigo-700 text-xs font-black hover:bg-white/90 transition-all shadow-sm disabled:opacity-50"
                      >
                        <Play className="h-4 w-4" /> Start
                      </button>
                    ) : activeStandup.status === 'IN_PROGRESS' ? (
                      <button
                        onClick={() => endMutation.mutate(activeStandup.id)}
                        disabled={endMutation.isPending}
                        className="inline-flex items-center gap-1.5 h-9 px-5 rounded-xl bg-red-500 text-white text-xs font-black hover:bg-red-600 transition-all shadow-sm disabled:opacity-50"
                      >
                        <Square className="h-4 w-4" /> End
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
                        <CheckCircle2 className="h-4 w-4 text-white" />
                        <span className="text-white text-xs font-bold">Completed</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Cards area */}
            <div className="bg-white/10 backdrop-blur-sm px-5 sm:px-7 py-5">
              {(activeStandup.cards ?? []).length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3 text-white/60">
                  <Users className="h-10 w-10 opacity-40" />
                  <p className="text-sm font-medium">No meeting cards yet for this session</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(activeStandup.cards ?? []).map((card) => (
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
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-border/50 bg-white/60">
            <div className="flex flex-col items-center py-16 gap-4 text-muted-foreground">
              <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-yellow-100 to-orange-100 flex items-center justify-center">
                <Zap className="h-8 w-8 text-orange-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground/60">No active meeting</p>
                <p className="text-sm mt-1">Select one from below or schedule a new one</p>
              </div>
              {canSchedule && (
                <button
                  onClick={() => setScheduleOpen(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-indigo-300 text-indigo-700 bg-indigo-50 text-sm font-semibold hover:bg-indigo-100 transition-colors mt-1"
                >
                  <Plus className="h-4 w-4" /> Schedule Meeting
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Tabbed: Recent | Daily Schedule ── */}
        <div>
          {/* Tab bar */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-border/60 shadow-sm mb-4 w-fit">
            {([
              { key: 'recent'   as const, label: 'Recent Meetings', icon: Calendar, hidden: false },
              { key: 'schedule' as const, label: 'Daily Schedule',  icon: Clock,    hidden: !canConfigureSchedule },
            ]).filter((t) => !t.hidden).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setMainTab(key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                  mainTab === key
                    ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {key === 'recent' && (
                  <span className={cn(
                    'text-[10px] font-black rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
                    mainTab === key ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground',
                  )}>
                    {standups.filter((s) => isToday(s.scheduledAt)).length}
                  </span>
                )}
                {key === 'schedule' && schedulableDepts.length > 0 && (
                  <span className={cn(
                    'text-[10px] font-black rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
                    mainTab === key ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground',
                  )}>
                    {schedulableDepts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Recent tab ── */}
          {mainTab === 'recent' && (
            (() => {
              const todayMeetings = standups.filter((s) => isToday(s.scheduledAt));
              return todayMeetings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-white/60 flex flex-col items-center py-14 gap-3 text-muted-foreground">
                <Zap className="h-9 w-9 opacity-20" />
                <div className="text-center">
                  <p className="text-sm font-medium">No meetings scheduled today</p>
                  {canSchedule && (
                    <button
                      onClick={() => setScheduleOpen(true)}
                      className="mt-2 text-xs text-primary hover:underline font-semibold"
                    >
                      Schedule a meeting →
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {todayMeetings.map((s) => {
                  const tok = statusConfig[s.status] ?? statusConfig.SCHEDULED;
                  const selected = activeId === s.id;
                  const standupIsToday = true;

                  return (
                    <div
                      key={s.id}
                      onClick={() => setActiveStandupId(s.id === activeStandupId ? null : s.id)}
                      className={cn(
                        'rounded-2xl border bg-white overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md hover:border-indigo-200/60 group',
                        selected ? 'border-indigo-300 shadow-md ring-2 ring-indigo-100' : 'border-border/60',
                        s.status === 'IN_PROGRESS' && 'border-blue-300',
                      )}
                    >
                      <div className={cn('h-0.5 w-full', {
                        'bg-gradient-to-r from-blue-400 to-indigo-500': s.status === 'IN_PROGRESS',
                        'bg-gradient-to-r from-emerald-400 to-green-500': s.status === 'COMPLETED',
                        'bg-gradient-to-r from-slate-300 to-gray-400': s.status === 'SCHEDULED',
                      })} />

                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className={cn('h-9 w-9 rounded-2xl flex items-center justify-center shrink-0', {
                          'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-200': s.status === 'IN_PROGRESS',
                          'bg-gradient-to-br from-emerald-400 to-green-500 shadow-sm shadow-green-200': s.status === 'COMPLETED',
                          'bg-gradient-to-br from-slate-300 to-gray-400': s.status === 'SCHEDULED',
                        })}>
                          {s.status === 'IN_PROGRESS' ? <Zap className="h-4 w-4 text-white" />
                            : s.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4 text-white" />
                            : <Clock className="h-4 w-4 text-white" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm group-hover:text-indigo-700 transition-colors truncate">{s.department.name}</p>
                            {standupIsToday && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">Today</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {new Date(s.scheduledAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                              {' · '}
                              {new Date(s.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Users className="h-3 w-3" /> {s._count.cards}
                            </span>
                            {s.overrunMinutes && s.overrunMinutes > 0 && (
                              <span className="text-[10px] font-semibold text-orange-600 flex items-center gap-0.5">
                                <Clock className="h-3 w-3" /> +{Math.round(s.overrunMinutes)}m over
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full border', tok.badge)}>
                            <span className={cn('inline-block h-1.5 w-1.5 rounded-full mr-1.5', tok.dot, s.status === 'IN_PROGRESS' && 'animate-pulse')} />
                            {tok.label}
                          </span>

                          {s.status !== 'COMPLETED' && s.meetUrl && standupIsToday && (
                            <a
                              href={s.meetUrl}
                              target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[11px] font-bold hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm shadow-blue-200"
                            >
                              <Video className="h-3.5 w-3.5" /> Join
                            </a>
                          )}

                          {canSchedule && s.status !== 'IN_PROGRESS' && (
                            confirmDeleteId === s.id ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => deleteMutation.mutate(s.id)} disabled={deleteMutation.isPending} className="h-7 px-2.5 rounded-lg bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 disabled:opacity-50">
                                  {deleteMutation.isPending ? '…' : 'Confirm'}
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)} className="h-7 px-2 rounded-lg border border-border/60 text-[10px] text-muted-foreground hover:bg-muted">
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }} className="h-8 w-8 rounded-xl border border-border/60 flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )
                          )}

                          <ArrowRight className={cn('h-4 w-4 text-muted-foreground/30 transition-all group-hover:text-indigo-400', selected && 'rotate-90 text-indigo-400')} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
            })()
          )}

          {/* ── Daily Schedule tab ── */}
          {mainTab === 'schedule' && canConfigureSchedule && (
            schedulableDepts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-white/60 flex flex-col items-center py-14 gap-3 text-muted-foreground">
                <Clock className="h-9 w-9 opacity-20" />
                <p className="text-sm font-medium">No departments to configure</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedulableDepts.map((dept) => (
                  <DailyScheduleCard key={dept.id} dept={dept} onUpdated={refetchDepts} />
                ))}
              </div>
            )
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

// ── Standup member card ────────────────────────────────────────────────────────
function StandupCardView({
  card, standupId, standupStatus, departmentId, currentUserId, currentUserRole, onSaved,
}: {
  card: StandupCard; standupId: string; standupStatus: string;
  departmentId: string; currentUserId?: string; currentUserRole?: string; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing]       = useState(false);
  const [logBlockerOpen, setLogBlockerOpen] = useState(false);
  const [yesterday, setYesterday]   = useState(card.yesterdaySummary || '');
  const [today, setToday]           = useState(card.todayCommitments || '');
  const [blockers, setBlockers]     = useState(card.blockers || '');
  const [saving, setSaving]         = useState(false);

  const isOwn        = card.userId === currentUserId;
  const canEdit      = isOwn && standupStatus === 'IN_PROGRESS';
  const hasBlocker   = !!(card.blockers && card.blockers.trim());
  const canLogTask   = hasBlocker && ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(currentUserRole || '');
  const submitted    = card.status === 'SUBMITTED';

  const handleSave = async () => {
    setSaving(true);
    await api.patch(`/standups/${standupId}/cards/${card.id}`, { yesterdaySummary: yesterday, todayCommitments: today, blockers });
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

  // Avatar color based on name hash
  const avatarColors = [
    'from-indigo-400 to-violet-500', 'from-sky-400 to-blue-500',
    'from-emerald-400 to-green-500', 'from-amber-400 to-orange-500',
    'from-rose-400 to-pink-500',     'from-teal-400 to-cyan-500',
  ];
  const colorIdx = card.user.name.charCodeAt(0) % avatarColors.length;

  return (
    <div className={cn(
      'rounded-2xl border bg-white/90 backdrop-blur-sm overflow-hidden transition-all',
      hasBlocker && !editing ? 'border-red-200 shadow-sm shadow-red-100' : 'border-white/60',
      isOwn && 'ring-1 ring-white/80',
    )}>
      {/* Card header */}
      <div className={cn('px-3 py-2.5 flex items-center justify-between', hasBlocker && !editing ? 'bg-red-50/60' : 'bg-white/60')}>
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 ring-2 ring-white shadow-sm">
            <AvatarFallback className={cn('text-[10px] font-black text-white bg-gradient-to-br', avatarColors[colorIdx])}>
              {getInitials(card.user.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs font-bold leading-tight">{card.user.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{card.user.role.toLowerCase().replace(/_/g, ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {submitted ? (
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <CheckCircle2 className="h-3 w-3" /> Done
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5">
              <Circle className="h-3 w-3" /> Pending
            </div>
          )}
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 transition-all"
            >
              <Edit2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pb-3 pt-2 space-y-2.5">
        {editing ? (
          <div className="space-y-2.5">
            {[
              { label: 'Yesterday', value: yesterday, setter: setYesterday, placeholder: 'What did you complete?' },
              { label: 'Today',     value: today,     setter: setToday,     placeholder: 'What will you work on?' },
              { label: 'Blockers',  value: blockers,  setter: setBlockers,  placeholder: 'Any impediments? (leave blank if none)' },
            ].map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
                <Textarea
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  rows={2}
                  className="text-xs resize-none rounded-xl border-border/60 focus-visible:ring-indigo-300 bg-white"
                />
              </div>
            ))}
            <div className="flex items-center gap-1.5 pt-1">
              <button
                onClick={handleSave} disabled={saving}
                className="flex-1 h-8 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Submit'}
              </button>
              <button
                onClick={handleCancel}
                className="h-8 px-3 rounded-xl border border-border/60 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {card.yesterdaySummary ? (
              <Section label="Yesterday" content={card.yesterdaySummary} />
            ) : isOwn && standupStatus === 'IN_PROGRESS' ? (
              <button
                onClick={() => setEditing(true)}
                className="w-full text-left text-xs text-muted-foreground border border-dashed border-border/60 rounded-xl p-2.5 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/40 transition-all"
              >
                Click to fill in your meeting update…
              </button>
            ) : null}

            {card.todayCommitments && <Section label="Today" content={card.todayCommitments} />}

            {hasBlocker && (
              <div className="rounded-xl border border-red-200 bg-red-50/70 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-700 uppercase tracking-widest">
                    <AlertTriangle className="h-3 w-3" /> Blocker
                  </div>
                  {canLogTask && (
                    <button
                      onClick={() => setLogBlockerOpen(true)}
                      className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-white border border-red-200 rounded-lg px-2 py-0.5 hover:bg-red-100 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Log Task
                    </button>
                  )}
                </div>
                <p className="text-xs text-red-800 leading-relaxed">{card.blockers}</p>
              </div>
            )}

            {!card.yesterdaySummary && !card.todayCommitments && !hasBlocker && !isOwn && (
              <p className="text-xs text-muted-foreground text-center py-3 italic">No update yet</p>
            )}
          </>
        )}
      </div>

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

function Section({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

// ── Log blocker as task dialog ─────────────────────────────────────────────────
function BlockerTaskDialog({
  open, blockerText, assigneeUserId, departmentId, onClose, onCreated,
}: {
  open: boolean; blockerText: string; assigneeUserId: string;
  departmentId: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle]           = useState(blockerText.slice(0, 120));
  const [blockerType, setBlockerType] = useState<BlockerType>('OTHER');
  const [saving, setSaving]         = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/tasks', { title: title.trim(), assigneeUserId, departmentId, status: 'BLOCKED', blockerType, priority: 'HIGH' });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            </div>
            Log Blocker as Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Task Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Describe the blocked work…" className="rounded-xl border-border/60 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Blocker Type</Label>
            <Select value={blockerType} onValueChange={(v) => setBlockerType(v as BlockerType)}>
              <SelectTrigger className="rounded-xl border-border/60 h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                {BLOCKER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/60 text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={handleCreate} disabled={saving || !title.trim()}
            className="h-9 px-5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> {saving ? 'Creating…' : 'Create Blocked Task'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
