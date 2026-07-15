import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Users, Target, Video, MapPin, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatRelative } from '@/lib/utils';
import { ReviewDetailDrawer } from '@/components/reviews/ReviewDetailDrawer';
import { GoalDialog } from '@/components/reviews/GoalDialog';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';

const GOAL_MUTATE_ROLES = ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'];

type Review = {
  id: string; type: string; scheduledAt: string; conductedAt?: string | null; mode?: string | null;
  department?: { id: string; name: string };
  participants: { id: string; user: { id: string; name: string; avatarUrl?: string } }[];
  goals: { id: string; cycle: string; title: string; status: string }[];
};

const TABS = [
  { key: 'TACTICAL', label: 'Tactical', sub: 'Every 15 days' },
  { key: 'STRATEGIC', label: 'Strategic', sub: 'Every 45 days' },
] as const;

export default function Reviews() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'TACTICAL' | 'STRATEGIC'>('TACTICAL');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(() => searchParams.get('reviewId'));
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  const canFilterByDepartment = ['OWNER', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const canSetGoals = GOAL_MUTATE_ROLES.includes(user?.role || '');
  // Dept Head/Manager only ever manage their own department — skip the picker for them.
  const ownDeptOnly = ['DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '') ? user?.departmentId : undefined;

  const { data: departments = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: canFilterByDepartment,
  });

  const { data: reviews = [], isLoading } = useQuery<Review[]>({
    queryKey: ['reviews', tab, departmentFilter],
    queryFn: () => api.get('/reviews', { params: { type: tab, departmentId: departmentFilter || undefined } }).then((r) => r.data),
  });

  const now = Date.now();
  const upcoming = reviews.filter((r) => new Date(r.scheduledAt).getTime() >= now).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const past = reviews.filter((r) => new Date(r.scheduledAt).getTime() < now);

  const openReview = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('reviewId', id);
    setSearchParams(next);
    setSelectedReviewId(id);
  };
  const closeReview = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('reviewId');
    setSearchParams(next);
    setSelectedReviewId(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="p-4 sm:p-6 lg:p-8 space-y-5">

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <CalendarClock className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Reviews</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tactical (15-day) and Strategic (45-day) department reviews, with goal-setting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canFilterByDepartment && (
              <Select value={departmentFilter || '__all__'} onValueChange={(v) => setDepartmentFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-52 h-9 text-sm rounded-xl border-border/60">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="__all__">All Departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {canSetGoals && (
              <button
                onClick={() => setGoalDialogOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 sm:px-4 py-2 text-xs font-bold text-white hover:from-indigo-600 hover:to-violet-700 shadow-sm shadow-indigo-200 transition-all"
              >
                <Plus className="h-4 w-4" />
                Set Goal
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-2xl border border-border/60 bg-white shadow-sm p-1.5 w-full sm:w-auto sm:inline-flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all',
                tab === t.key ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              {t.label}
              <span className={cn('block text-[10px] font-medium mt-0.5', tab === t.key ? 'text-white/80' : 'text-muted-foreground/70')}>{t.sub}</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2.5">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white border border-border/60 animate-pulse" />)}
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {upcoming.length > 0 && (
              <Section title="Upcoming" reviews={upcoming} onClick={openReview} />
            )}
            {past.length > 0 && (
              <Section title="Past" reviews={past} onClick={openReview} muted />
            )}
          </div>
        )}
      </div>

      <ReviewDetailDrawer reviewId={selectedReviewId} onClose={closeReview} />
      {canSetGoals && (
        <GoalDialog
          open={goalDialogOpen}
          onClose={() => setGoalDialogOpen(false)}
          departmentId={ownDeptOnly}
        />
      )}
    </div>
  );
}

function Section({ title, reviews, onClick, muted }: { title: string; reviews: Review[]; onClick: (id: string) => void; muted?: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">{title}</p>
      <div className="space-y-2.5">
        {reviews.map((r) => <ReviewCard key={r.id} review={r} onClick={() => onClick(r.id)} muted={muted} />)}
      </div>
    </div>
  );
}

function ReviewCard({ review, onClick, muted }: { review: Review; onClick: () => void; muted?: boolean }) {
  const strategicGoals = review.goals.filter((g) => g.cycle === 'STRATEGIC');
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-indigo-200/60 border-border/60 p-4',
        muted && 'opacity-70'
      )}
    >
      <div className="flex items-start sm:items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm sm:text-[15px]">{review.department?.name || 'Department'} {review.type === 'STRATEGIC' ? 'Strategic' : 'Tactical'} Review</p>
            {review.mode && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 font-semibold">
                {review.mode === 'ONLINE' ? <Video className="h-2.5 w-2.5" /> : <MapPin className="h-2.5 w-2.5" />}
                {review.mode === 'ONLINE' ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-muted-foreground font-medium">
            <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {new Date(review.scheduledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {formatRelative(review.scheduledAt)}</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {review.participants.length} attendee{review.participants.length !== 1 ? 's' : ''}</span>
            {strategicGoals.length > 0 && (
              <span className="flex items-center gap-1"><Target className="h-3 w-3" /> {strategicGoals.length} goal{strategicGoals.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-24 gap-4 text-muted-foreground">
      <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-center">
        <CalendarClock className="h-10 w-10 text-indigo-200" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground/60">No reviews yet</p>
        <p className="text-sm mt-1">Tactical and Strategic reviews are auto-scheduled on their cadence.</p>
      </div>
    </div>
  );
}
