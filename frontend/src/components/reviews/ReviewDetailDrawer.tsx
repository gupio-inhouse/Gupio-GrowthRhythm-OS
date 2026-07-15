import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Users, Target, Video, MapPin, Plus, CheckCircle2, Circle, Paperclip, FileText, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { cn, getInitials, formatRelative } from '@/lib/utils';
import { GoalDialog } from './GoalDialog';
import { DocumentPreviewDialog } from './DocumentPreviewDialog';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';

type GoalAttachment = { id: string; name: string; url: string; size?: number | null; createdAt: string };
type Goal = {
  id: string; cycle: string; title: string; description?: string | null; startDate?: string | null; targetDate: string;
  status: string; progressPercent?: number | null; parentGoalId?: string | null;
  subGoals?: Goal[];
  attachments?: GoalAttachment[];
};

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// The Nth Tactical (15-day) checkpoint under a Strategic goal lands N*15 days after
// the Strategic goal's own start date — so the 3 checkpoints fall at +15/+30/+45.
function suggestNextTacticalDate(strategicGoal: Goal): string {
  const anchor = strategicGoal.startDate ? strategicGoal.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const existingTacticalCount = (strategicGoal.subGoals || []).filter((g) => g.cycle === 'TACTICAL').length;
  return addDaysISO(anchor, 15 * (existingTacticalCount + 1));
}
type Participant = {
  id: string; attended: boolean | null;
  user: { id: string; name: string; avatarUrl?: string; role: string };
};
type ReviewDetail = {
  id: string; type: string; scheduledAt: string; mode?: string | null;
  agenda?: string | null; decisions?: string | null;
  department?: { id: string; name: string };
  participants: Participant[];
  goals: Goal[];
};

const MUTATE_ROLES = ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'];

function resolveAttachmentUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = api.defaults.baseURL;
  if (typeof base === 'string' && /^https?:\/\//i.test(base)) return new URL(url, base).toString();
  return url;
}

interface Props {
  reviewId: string | null;
  onClose: () => void;
}

export function ReviewDetailDrawer({ reviewId, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canMutate = MUTATE_ROLES.includes(user?.role || '');

  const [agenda, setAgenda] = useState('');
  const [decisions, setDecisions] = useState('');
  const [goalDialogFor, setGoalDialogFor] = useState<{ cycle: 'STRATEGIC' | 'TACTICAL'; parentGoalId?: string; defaultTargetDate?: string } | null>(null);

  const { data: review, isLoading } = useQuery<ReviewDetail>({
    queryKey: ['review', reviewId],
    queryFn: () => api.get(`/reviews/${reviewId}`).then((r) => r.data),
    enabled: !!reviewId,
  });

  useEffect(() => {
    if (review) {
      setAgenda(review.agenda || '');
      setDecisions(review.decisions || '');
    }
  }, [review]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch(`/reviews/${reviewId}`, { agenda, decisions }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review', reviewId] });
      qc.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Saved');
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: ({ participantId, attended }: { participantId: string; attended: boolean }) =>
      api.patch(`/reviews/${reviewId}/participants/${participantId}`, { attended }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review', reviewId] }),
  });

  if (!reviewId) return null;

  const strategicGoals = (review?.goals || []).filter((g) => g.cycle === 'STRATEGIC');

  return (
    <>
      <Sheet open={!!reviewId} onClose={onClose}>
        {isLoading || !review ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-8 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                  {review.type === 'STRATEGIC' ? 'Strategic · 45-day' : review.type === 'TACTICAL' ? 'Tactical · 15-day' : review.type}
                </span>
                {review.mode && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 font-semibold">
                    {review.mode === 'ONLINE' ? <Video className="h-2.5 w-2.5" /> : <MapPin className="h-2.5 w-2.5" />}
                    {review.mode === 'ONLINE' ? 'Online' : 'Offline'}
                  </span>
                )}
              </div>
              <SheetTitle>{review.department?.name || 'Department'} Review</SheetTitle>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                {new Date(review.scheduledAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              </p>
            </SheetHeader>

            <SheetContent className="space-y-6">
              {/* Participants */}
              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Attendees ({review.participants.length})
                </p>
                <div className="space-y-1.5">
                  {review.participants.map((p) => {
                    const canToggle = canMutate || p.user.id === user?.id;
                    return (
                      <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={p.user.avatarUrl} />
                          <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                            {getInitials(p.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{p.user.name}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">{p.user.role.toLowerCase().replace(/_/g, ' ')}</p>
                        </div>
                        {canToggle ? (
                          <Switch
                            checked={!!p.attended}
                            onCheckedChange={(checked) => attendanceMutation.mutate({ participantId: p.id, attended: checked })}
                          />
                        ) : p.attended ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Agenda / Decisions */}
              <section className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Agenda</p>
                <Textarea
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  disabled={!canMutate}
                  placeholder={canMutate ? 'What will this review cover?' : 'No agenda recorded yet.'}
                  rows={3}
                  className="rounded-xl resize-none text-sm"
                />
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Decisions &amp; Outcomes</p>
                <Textarea
                  value={decisions}
                  onChange={(e) => setDecisions(e.target.value)}
                  disabled={!canMutate}
                  placeholder={canMutate ? 'What was decided?' : 'No decisions recorded yet.'}
                  rows={3}
                  className="rounded-xl resize-none text-sm"
                />
                {canMutate && (
                  <Button
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700"
                  >
                    Save
                  </Button>
                )}
              </section>

              {/* Goals */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" /> Goals
                  </p>
                  {canMutate && (
                    <button
                      onClick={() => setGoalDialogFor({ cycle: 'STRATEGIC' })}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      <Plus className="h-3 w-3" /> 45-day goal
                    </button>
                  )}
                </div>

                {strategicGoals.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No goals set for this review yet.</p>
                ) : (
                  <div className="space-y-3">
                    {strategicGoals.map((g) => (
                      <div key={g.id} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{g.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {g.startDate
                                ? `${new Date(g.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(g.targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                : `Due ${new Date(g.targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            </p>
                          </div>
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0',
                            g.status === 'ACHIEVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : g.status === 'MISSED' ? 'bg-red-50 text-red-700 border-red-200'
                            : g.status === 'CARRIED_OVER' ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200')}>
                            {g.status}
                          </span>
                        </div>
                        {typeof g.progressPercent === 'number' && <Progress value={g.progressPercent} className="h-1.5" />}

                        <GoalAttachments goal={g} canMutate={canMutate} />

                        {(g.subGoals || []).length > 0 && (
                          <div className="pl-3 border-l-2 border-indigo-200 space-y-2 pt-1">
                            {g.subGoals!.map((sg) => (
                              <div key={sg.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium truncate">{sg.title}</p>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white border border-border/60 text-muted-foreground font-semibold shrink-0">
                                    15-day · {sg.status}
                                  </span>
                                </div>
                                <GoalAttachments goal={sg} canMutate={canMutate} compact />
                              </div>
                            ))}
                          </div>
                        )}

                        {canMutate && (
                          <button
                            onClick={() => setGoalDialogFor({ cycle: 'TACTICAL', parentGoalId: g.id, defaultTargetDate: suggestNextTacticalDate(g) })}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            <Plus className="h-3 w-3" /> Add 15-day checkpoint
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </SheetContent>
          </>
        )}
      </Sheet>

      {review && goalDialogFor && (
        <GoalDialog
          open={!!goalDialogFor}
          onClose={() => setGoalDialogFor(null)}
          departmentId={review.department!.id}
          reviewId={review.id}
          cycle={goalDialogFor.cycle}
          parentGoalId={goalDialogFor.parentGoalId}
          defaultTargetDate={goalDialogFor.defaultTargetDate}
          lockCycle
        />
      )}
    </>
  );
}

function GoalAttachments({ goal, canMutate, compact }: { goal: Goal; canMutate: boolean; compact?: boolean }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<{ name: string; url: string } | null>(null);
  const attachments = goal.attachments || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['review'] });
    qc.invalidateQueries({ queryKey: ['reviews'] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const up = await api.post('/upload/content', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return api.post(`/goals/${goal.id}/attachments`, { name: up.data.originalName, url: up.data.url, size: up.data.size });
    },
    onSuccess: invalidate,
    onError: (_e, file) => toast.error(`Failed to upload "${file.name}"`),
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => api.delete(`/goals/${goal.id}/attachments/${attachmentId}`),
    onMutate: (attachmentId) => setRemovingId(attachmentId),
    onSuccess: invalidate,
    onSettled: () => setRemovingId(null),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    files.forEach((file) => uploadMutation.mutate(file));
  };

  if (attachments.length === 0 && !canMutate) return null;

  return (
    <div className={cn('space-y-1', compact ? 'pl-0' : '')}>
      {attachments.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-border/60 px-2 py-1">
          <button
            onClick={() => setPreviewing({ name: a.name, url: resolveAttachmentUrl(a.url) })}
            className="flex items-center gap-1.5 min-w-0 text-[11px] font-medium hover:text-indigo-700"
          >
            <FileText className="h-3 w-3 shrink-0 text-violet-600" />
            <span className="truncate">{a.name}</span>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-muted-foreground">{formatRelative(a.createdAt)}</span>
            {canMutate && (
              <button
                onClick={() => deleteMutation.mutate(a.id)}
                disabled={removingId === a.id}
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      ))}

      {canMutate && (
        <>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <Paperclip className="h-2.5 w-2.5" /> {uploadMutation.isPending ? 'Uploading…' : 'Add documents'}
          </button>
        </>
      )}

      <DocumentPreviewDialog attachment={previewing} onClose={() => setPreviewing(null)} />
    </div>
  );
}
