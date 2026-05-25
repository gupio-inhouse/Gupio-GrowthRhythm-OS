import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Sparkles, CheckCircle2, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import api from '@/api/client';

type ReviewType = 'TACTICAL' | 'STRATEGIC' | 'ONE_ON_ONE' | 'DEPARTMENT';

type ActionItem = {
  text: string;
  owner?: string;
  dueDate?: string;
  done: boolean;
};

type Review = {
  id: string;
  type: ReviewType;
  departmentId?: string;
  scheduledAt: string;
  conductedAt?: string;
  agenda?: string;
  decisions?: string;
  actionItems?: ActionItem[];
  createdBy: string;
  orgId: string;
};

type Department = {
  id: string;
  name: string;
  slug: string;
};

const TYPE_LABELS: Record<ReviewType, string> = {
  TACTICAL: 'Tactical',
  STRATEGIC: 'Strategic',
  ONE_ON_ONE: 'One-on-One',
  DEPARTMENT: 'Department',
};

const TYPE_BADGE_CLASS: Record<ReviewType, string> = {
  TACTICAL: 'bg-blue-50 text-blue-700 border-blue-200',
  STRATEGIC: 'bg-purple-50 text-purple-700 border-purple-200',
  ONE_ON_ONE: 'bg-green-50 text-green-700 border-green-200',
  DEPARTMENT: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

// ── NewReviewDialog ────────────────────────────────────────────────────────────

function NewReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<ReviewType>('TACTICAL');
  const [departmentId, setDepartmentId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [agenda, setAgenda] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/reviews', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      handleClose();
    },
  });

  const handleClose = () => {
    setType('TACTICAL');
    setDepartmentId('');
    setScheduledAt('');
    setAgenda('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!scheduledAt) return;
    setSaving(true);
    await createMutation.mutateAsync({
      type,
      departmentId: departmentId || undefined,
      scheduledAt: new Date(scheduledAt).toISOString(),
      agenda: agenda || undefined,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-500" />
            New Review
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Review Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReviewType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as ReviewType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Department (optional)</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Scheduled Date *</Label>
            <Input
              type="date"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Agenda (optional)</Label>
            <Textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Initial agenda topics..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!scheduledAt || saving} className="gap-2">
            <Plus className="h-4 w-4" />
            {saving ? 'Creating...' : 'Create Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ReviewDetailDialog ─────────────────────────────────────────────────────────

function ReviewDetailDialog({
  review,
  onClose,
}: {
  review: Review;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [agenda, setAgenda] = useState(review.agenda || '');
  const [decisions, setDecisions] = useState(review.decisions || '');
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    (review.actionItems as ActionItem[]) || []
  );
  const [newItemText, setNewItemText] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/reviews/${review.id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews'] }),
  });

  const handleSave = async () => {
    setSaving(true);
    await patchMutation.mutateAsync({ agenda, decisions, actionItems });
    setSaving(false);
  };

  const handleMarkConducted = async () => {
    await patchMutation.mutateAsync({ conductedAt: new Date().toISOString() });
    onClose();
  };

  const handleGenerateAiAgenda = async () => {
    setAiLoading(true);
    try {
      const res = await api.post(`/reviews/${review.id}/ai-agenda`, {});
      setAgenda(res.data.agenda as string);
    } catch {
      // silently fail — user sees unchanged textarea
    } finally {
      setAiLoading(false);
    }
  };

  const addActionItem = () => {
    if (!newItemText.trim()) return;
    setActionItems((prev) => [...prev, { text: newItemText.trim(), done: false }]);
    setNewItemText('');
  };

  const toggleItem = (idx: number) => {
    setActionItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, done: !item.done } : item))
    );
  };

  const removeItem = (idx: number) => {
    setActionItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const dept = review.departmentId ? `· Dept ${review.departmentId}` : '';
  const title = `${TYPE_LABELS[review.type]} Review ${dept}`;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', TYPE_BADGE_CLASS[review.type])}>
              {TYPE_LABELS[review.type]}
            </span>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Agenda */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Agenda</Label>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7"
                onClick={handleGenerateAiAgenda}
                disabled={aiLoading}
              >
                <Sparkles className="h-3 w-3 text-purple-500" />
                {aiLoading ? 'Generating...' : 'Generate AI Agenda'}
              </Button>
            </div>
            <Textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Add agenda topics..."
              rows={4}
            />
          </div>

          {/* Decisions */}
          <div className="space-y-2">
            <Label>Decisions</Label>
            <Textarea
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              placeholder="Record decisions made during this review..."
              rows={3}
            />
          </div>

          {/* Action Items */}
          <div className="space-y-2">
            <Label>Action Items</Label>
            <div className="space-y-2">
              {actionItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 group">
                  <button
                    onClick={() => toggleItem(idx)}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      item.done
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-muted-foreground/30 hover:border-green-400'
                    )}
                  >
                    {item.done && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <span
                    className={cn(
                      'flex-1 text-sm',
                      item.done && 'line-through text-muted-foreground'
                    )}
                  >
                    {item.text}
                  </span>
                  {item.owner && (
                    <span className="text-xs text-muted-foreground shrink-0">{item.owner}</span>
                  )}
                  {item.dueDate && (
                    <span className="text-xs text-muted-foreground shrink-0">{item.dueDate}</span>
                  )}
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-muted-foreground/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Add action item..."
                className="text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addActionItem()}
              />
              <Button size="sm" variant="outline" onClick={addActionItem} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          {!review.conductedAt && (
            <Button variant="outline" onClick={handleMarkConducted} className="gap-2 sm:mr-auto">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Mark as Conducted
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ReviewCard ─────────────────────────────────────────────────────────────────

function ReviewCard({ review, onClick }: { review: Review; onClick: () => void }) {
  const scheduledDate = new Date(review.scheduledAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:shadow-md transition-shadow"
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  'inline-block text-xs font-medium px-2 py-0.5 rounded-full border shrink-0',
                  TYPE_BADGE_CLASS[review.type]
                )}
              >
                {TYPE_LABELS[review.type]}
              </span>
              {review.conductedAt && (
                <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">
                  Conducted
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium truncate">
              {TYPE_LABELS[review.type]} Review
              {review.departmentId ? ` — Dept` : ''}
            </p>
          </div>
          <p className="text-xs text-muted-foreground shrink-0">{scheduledDate}</p>
        </div>
        {review.agenda && (
          <p className="text-xs text-muted-foreground line-clamp-2">{review.agenda}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Reviews() {
  const { user } = useAuthStore();
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Review | null>(null);

  const canCreate = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');

  const { data: reviews = [], isLoading } = useQuery<Review[]>({
    queryKey: ['reviews'],
    queryFn: () => api.get('/reviews').then((r) => r.data),
  });

  const upcoming = reviews.filter((r) => !r.conductedAt);
  const completed = reviews.filter((r) => !!r.conductedAt);

  return (
    <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-500" />
            Reviews
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {upcoming.length} upcoming · {completed.length} completed
          </p>
        </div>
        {canCreate && (
          <Button className="gap-2" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            New Review
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm">No upcoming reviews</p>
              {canCreate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => setNewOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Schedule a review
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map((r) => (
                <ReviewCard key={r.id} review={r} onClick={() => setSelected(r)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {completed.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm">No completed reviews yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completed.map((r) => (
                <ReviewCard key={r.id} review={r} onClick={() => setSelected(r)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <NewReviewDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {selected && (
        <ReviewDetailDialog
          review={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
