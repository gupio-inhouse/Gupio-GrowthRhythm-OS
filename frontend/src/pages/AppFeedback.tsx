import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Building2, User, Filter, ThumbsUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import api from '@/api/client';

type FeedbackCategory = 'BUG' | 'FEATURE_REQUEST' | 'UI_UX' | 'PERFORMANCE' | 'OTHER';
type FeedbackStatus = 'OPEN' | 'UNDER_REVIEW' | 'PLANNED' | 'IMPLEMENTED' | 'DISMISSED';

type Feedback = {
  id: string;
  title: string;
  description: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  upvotes: number;
  hasVoted: boolean;
  createdAt: string;
  user: { id: string; name: string; role: string };
  department: { id: string; name: string; slug: string } | null;
};

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  BUG: 'Bug',
  FEATURE_REQUEST: 'Feature Request',
  UI_UX: 'UI / UX',
  PERFORMANCE: 'Performance',
  OTHER: 'Other',
};

const CATEGORY_COLORS: Record<FeedbackCategory, string> = {
  BUG: 'bg-red-500/10 text-red-400 border-red-500/20',
  FEATURE_REQUEST: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  UI_UX: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  PERFORMANCE: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  OTHER: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under Review',
  PLANNED: 'Planned',
  IMPLEMENTED: 'Implemented',
  DISMISSED: 'Dismissed',
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  OPEN: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  UNDER_REVIEW: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PLANNED: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  IMPLEMENTED: 'bg-green-500/10 text-green-400 border-green-500/20',
  DISMISSED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function AppFeedbackPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: feedbackList = [], isLoading } = useQuery<Feedback[]>({
    queryKey: ['app-feedback', statusFilter, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      return api.get(`/feedback?${params}`).then((r) => r.data);
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/feedback/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-feedback'] }),
  });

  const upvote = useMutation({
    mutationFn: (id: string) => api.post(`/feedback/${id}/upvote`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-feedback'] }),
  });

  const counts = feedbackList.reduce(
    (acc, f) => { acc[f.status] = (acc[f.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            App Feedback
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Improvement suggestions from your team
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {feedbackList.length} {feedbackList.length === 1 ? 'item' : 'items'}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => (
          <Card
            key={s}
            className={cn(
              'cursor-pointer border transition-colors',
              statusFilter === s ? 'border-primary' : 'border-border hover:border-primary/40'
            )}
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
          >
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{counts[s] || 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{STATUS_LABELS[s]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(Object.keys(CATEGORY_LABELS) as FeedbackCategory[]).map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Feedback list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : feedbackList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No feedback yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feedbackList.map((f) => (
            <Card key={f.id} className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{f.title}</span>
                      <Badge className={cn('text-xs border', CATEGORY_COLORS[f.category])}>
                        {CATEGORY_LABELS[f.category]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      {f.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {f.user.name}
                        <span className="opacity-60 capitalize">
                          ({f.user.role.toLowerCase().replace(/_/g, ' ')})
                        </span>
                      </span>
                      {f.department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {f.department.name}
                        </span>
                      )}
                      <span>{new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <button
                        onClick={() => upvote.mutate(f.id)}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2 py-0.5 border transition-colors',
                          f.hasVoted
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            : 'border-border hover:border-blue-500/30 hover:text-blue-400'
                        )}
                      >
                        <ThumbsUp className="h-3 w-3" />
                        {f.upvotes}
                      </button>
                    </div>
                  </div>

                  {/* Status selector */}
                  <Select
                    value={f.status}
                    onValueChange={(val) => updateStatus.mutate({ id: f.id, status: val })}
                  >
                    <SelectTrigger className={cn('w-36 h-8 text-xs border', STATUS_COLORS[f.status])}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
