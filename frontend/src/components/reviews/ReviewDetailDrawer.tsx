import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Users, Target, Video, MapPin, Plus, CheckCircle2, Circle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { GoalDialog } from './GoalDialog';
import { GoalCard, GoalsEmptyState, suggestNextTacticalDate, type Goal } from './GoalCard';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';

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
                  <GoalsEmptyState />
                ) : (
                  <div className="space-y-3">
                    {strategicGoals.map((g) => (
                      <GoalCard
                        key={g.id}
                        goal={g}
                        canMutate={canMutate}
                        onAddCheckpoint={(goal) => setGoalDialogFor({ cycle: 'TACTICAL', parentGoalId: goal.id, defaultTargetDate: suggestNextTacticalDate(goal) })}
                      />
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
