import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, Paperclip, FileText, X, Building2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn, formatRelative } from '@/lib/utils';
import { DocumentPreviewDialog } from './DocumentPreviewDialog';
import api from '@/api/client';
import { toast } from '@/hooks/use-toast';

export type GoalAttachment = { id: string; name: string; url: string; size?: number | null; createdAt: string };
export type Goal = {
  id: string; cycle: string; title: string; description?: string | null; startDate?: string | null; targetDate: string;
  status: string; progressPercent?: number | null; parentGoalId?: string | null;
  department?: { id: string; name: string } | null;
  subGoals?: Goal[];
  attachments?: GoalAttachment[];
};

export function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// The Nth Tactical (15-day) checkpoint under a Strategic goal lands N*15 days after
// the Strategic goal's own start date — so the 3 checkpoints fall at +15/+30/+45.
export function suggestNextTacticalDate(strategicGoal: Goal): string {
  const anchor = strategicGoal.startDate ? strategicGoal.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const existingTacticalCount = (strategicGoal.subGoals || []).filter((g) => g.cycle === 'TACTICAL').length;
  return addDaysISO(anchor, 15 * (existingTacticalCount + 1));
}

function resolveAttachmentUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = api.defaults.baseURL;
  if (typeof base === 'string' && /^https?:\/\//i.test(base)) return new URL(url, base).toString();
  return url;
}

const STATUS_STYLE: Record<string, string> = {
  ACHIEVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MISSED: 'bg-red-50 text-red-700 border-red-200',
  CARRIED_OVER: 'bg-amber-50 text-amber-700 border-amber-200',
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
};

interface GoalCardProps {
  goal: Goal;
  canMutate: boolean;
  onAddCheckpoint?: (goal: Goal) => void;
}

export function GoalCard({ goal: g, canMutate, onAddCheckpoint }: GoalCardProps) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold">{g.title}</p>
            {g.department && (
              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold shrink-0">
                <Building2 className="h-2.5 w-2.5" /> {g.department.name}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {g.startDate
              ? `${new Date(g.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(g.targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : `Due ${new Date(g.targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        </div>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0', STATUS_STYLE[g.status] || STATUS_STYLE.ACTIVE)}>
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

      {canMutate && onAddCheckpoint && (
        <button
          onClick={() => onAddCheckpoint(g)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="h-3 w-3" /> Add 15-day checkpoint
        </button>
      )}
    </div>
  );
}

export function GoalsEmptyState() {
  return (
    <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
      <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-center">
        <Target className="h-8 w-8 text-indigo-200" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground/60">No goals set yet</p>
        <p className="text-xs mt-1">Use "Set Goal" to add a 45-day Strategic goal for this department.</p>
      </div>
    </div>
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
    qc.invalidateQueries({ queryKey: ['goals'] });
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
