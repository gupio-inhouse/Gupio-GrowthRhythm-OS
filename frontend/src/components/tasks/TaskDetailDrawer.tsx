import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, Calendar, User, Flag, Building2, AlertTriangle, Pencil, Trash2,
  ImagePlus, FileText, GitPullRequest, ExternalLink, Link2, Layers,
  CheckCircle2, Clock, Zap, ChevronRight, Sparkles, X,
} from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BlockerDialog } from './BlockerDialog';
import { NewTaskDialog, type TaskToEdit } from './NewTaskDialog';
import { cn, formatDate, formatRelative, getInitials, isEngineeringDept, workingDurationLabel, countWorkingDays } from '@/lib/utils';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────
type Comment = {
  id: string; content: string; createdAt: string;
  user: { id: string; name: string; avatarUrl?: string };
};
type TaskAttachment = {
  id: string; name: string; url: string; type: string; size?: number | null; createdAt: string;
};
type TaskStatusHistory = {
  id: string; fromStatus: string | null; toStatus: string; changedAt: string;
  changedBy: { id: string; name: string; avatarUrl?: string };
  blockerType?: string | null; blockerDescription?: string | null;
  blockerExpectedResolution?: string | null; suggestions?: unknown[] | null;
};
type TaskDetail = {
  id: string; title: string; description?: string; expectedOutcome?: string;
  status: string; priority: string; startDate?: string; dueDate?: string; createdAt?: string;
  completionSubmittedAt?: string; completedAt?: string;
  completionReviewedAt?: string; blockerType?: string; blockerExpectedResolution?: string;
  assignee: { id: string; name: string; avatarUrl?: string };
  assignedBy?: { id: string; name: string };
  completionReviewedBy?: { id: string; name: string };
  department?: { id: string; name: string };
  team?: { id: string; name: string };
  comments: Comment[]; attachments: TaskAttachment[]; statusHistories: TaskStatusHistory[];
};
interface Props {
  taskId: string | null;
  initialDeliveryAction?: 'SCREENSHOT' | 'DOCUMENT' | 'PULL_REQUEST' | null;
  onClose: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'];
// A TEAM_MEMBER can never put her own task directly into DONE or CANCELLED — those are
// reviewer/manager-only outcomes. She submits her work by moving it to IN_REVIEW herself.
const TEAM_MEMBER_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'];
const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked',
  IN_REVIEW: 'In Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

const S: Record<string, { dot: string; badge: string; bar: string; icon: typeof CheckCircle2; grad: string }> = {
  TODO:        { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',         bar: '#94a3b8', icon: Clock,         grad: 'from-slate-400 to-gray-500' },
  IN_PROGRESS: { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',            bar: '#3b82f6', icon: Zap,           grad: 'from-blue-500 to-indigo-600' },
  BLOCKED:     { dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',              bar: '#ef4444', icon: AlertTriangle,  grad: 'from-red-500 to-rose-600' },
  IN_REVIEW:   { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',        bar: '#f59e0b', icon: Clock,         grad: 'from-amber-500 to-orange-600' },
  DONE:        { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',  bar: '#10b981', icon: CheckCircle2,  grad: 'from-emerald-500 to-green-600' },
  CANCELLED:   { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',           bar: '#d1d5db', icon: X,             grad: 'from-gray-400 to-gray-500' },
};

const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH:     'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  LOW:      'bg-gray-50 text-gray-500 border-gray-200',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours(), m = d.getMinutes();
  return h === 0 && m === 0
    ? formatDate(dateStr)
    : `${formatDate(dateStr)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function formatTaskError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const r = (error as Record<string, unknown>).response;
    if (typeof r === 'object' && r !== null && 'data' in r) {
      const d = (r as Record<string, unknown>).data;
      if (typeof d === 'object' && d !== null && 'error' in d && typeof (d as Record<string, unknown>).error === 'string')
        return (d as Record<string, string>).error;
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
function resolveAttachmentUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = api.defaults.baseURL;
  if (typeof base === 'string' && /^https?:\/\//i.test(base)) return new URL(url, base).toString();
  return url;
}
function isOverdueDate(dueDate: string, status: string) {
  return !!dueDate && !['DONE', 'CANCELLED'].includes(status) && new Date(dueDate) < new Date();
}

// ── Drawer ─────────────────────────────────────────────────────────────────────
export function TaskDetailDrawer({ taskId, initialDeliveryAction = null, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [comment, setComment]         = useState('');
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [editOpen, setEditOpen]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prUrl, setPrUrl]     = useState('');
  const [prFormOpen, setPrFormOpen] = useState(false);
  const deliverySectionRef  = useRef<HTMLDivElement | null>(null);
  const screenshotInputRef  = useRef<HTMLInputElement | null>(null);
  const documentInputRef    = useRef<HTMLInputElement | null>(null);

  const canEditAsManager = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canContribute    = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(user?.role || '');
  const canDelete        = canEditAsManager;

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then((r) => r.data),
    enabled: !!taskId,
  });
  const canEdit = canEditAsManager || (user?.role === 'TEAM_MEMBER' && !!task && task.assignee?.id === user?.id);

  const STATUS_TOAST: Record<string, string> = {
    IN_PROGRESS: 'Task moved to In Progress',
    IN_REVIEW:   'Submitted for review',
    DONE:        'Task marked as Done',
    BLOCKED:     'Task blocked',
    CANCELLED:   'Task cancelled',
    TODO:        'Task moved back to To Do',
  };
  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/tasks/${taskId}`, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      const newStatus = variables.status as string | undefined;
      if (newStatus) toast.success(STATUS_TOAST[newStatus] ?? 'Status updated');
    },
    onError: (e) => toast.error(formatTaskError(e)),
  });
  const commentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/tasks/${taskId}/comments`, { content }),
    onSuccess: () => { setComment(''); qc.invalidateQueries({ queryKey: ['task', taskId] }); },
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${taskId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); onClose(); },
  });
  const attachmentMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: 'SCREENSHOT' | 'DOCUMENT' }) => {
      const form = new FormData(); form.append('file', file);
      const up = await api.post('/upload/content', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return api.post(`/tasks/${taskId}/attachments`, { name: up.data.originalName, url: up.data.url, type, size: up.data.size });
    },
    onSuccess: (_r, v) => {
      toast.success(v.type === 'SCREENSHOT' ? 'Screenshot added.' : 'Document added.');
      qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: (e) => toast.error(formatTaskError(e)),
  });
  const pullRequestMutation = useMutation({
    mutationFn: ({ title, url }: { title: string; url: string }) =>
      api.post(`/tasks/${taskId}/pull-requests`, { title, url }),
    onSuccess: () => {
      setPrTitle(''); setPrUrl(''); setPrFormOpen(false);
      toast.success('PR linked to task.');
      qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: (e) => toast.error(formatTaskError(e)),
  });
  const removeAttachmentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${taskId}/attachments/${id}`),
    onSuccess: () => {
      toast.success('Item removed.');
      qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: (e) => toast.error(formatTaskError(e)),
  });

  const isOwnTask = !!task && !!user?.id && task.assignee?.id === user.id;
  const totalDeliveries = (task?.attachments ?? []).length;
  const needsDeliveryBeforeDone = isOwnTask && task?.status !== 'IN_REVIEW' && totalDeliveries === 0;

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'BLOCKED') { setPendingStatus(newStatus); setBlockerOpen(true); return; }
    // A TEAM_MEMBER submits her own work via IN_REVIEW directly now (DONE isn't offered
    // to her at all) — same delivery-proof gate applies to either path.
    if (newStatus === 'DONE' || newStatus === 'IN_REVIEW') {
      // Re-read directly from task/user so we are never working with a stale closure value
      const myId = user?.id;
      const assigneeId = task?.assignee?.id;
      const currentStatus = task?.status;
      const deliveryCount = (task?.attachments ?? []).length;
      const submittingOwnWork = !!myId && !!assigneeId && myId === assigneeId && currentStatus !== 'IN_REVIEW';
      if (submittingOwnWork && deliveryCount === 0) {
        toast.error('Delivery proof required', 'Upload a screenshot, document, or PR link before submitting your work.');
        deliverySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    updateMutation.mutate({ status: newStatus });
  };
  const handleBlockerConfirm = (data: { blockerType: string; blockerDescription: string; blockerExpectedResolution?: string }) => {
    updateMutation.mutate({
      status: 'BLOCKED', blockerType: data.blockerType, blockerDescription: data.blockerDescription,
      blockerExpectedResolution: data.blockerExpectedResolution ? new Date(data.blockerExpectedResolution).toISOString() : undefined,
    });
    setBlockerOpen(false); setPendingStatus(null);
  };
  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    commentMutation.mutate(comment.trim());
  };
  const handleAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>, type: 'SCREENSHOT' | 'DOCUMENT') => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    await attachmentMutation.mutateAsync({ file, type });
  };
  const handlePullRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prTitle.trim() || !prUrl.trim()) return;
    await pullRequestMutation.mutateAsync({ title: prTitle.trim(), url: prUrl.trim() });
  };

  useEffect(() => {
    if (!task || !initialDeliveryAction) return;
    setPrFormOpen(initialDeliveryAction === 'PULL_REQUEST');
    requestAnimationFrame(() => deliverySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [initialDeliveryAction, task]);

  const taskToEdit: TaskToEdit | null = task ? {
    id: task.id, title: task.title, description: task.description, expectedOutcome: task.expectedOutcome,
    priority: task.priority, startDate: task.startDate, dueDate: task.dueDate, assignee: task.assignee, department: task.department,
    teamId: task.team?.id,
    phaseId: (task as any).phase?.id,
  } : null;

  const screenshots   = (task?.attachments ?? []).filter((a) => a.type === 'SCREENSHOT');
  const pullRequests  = (task?.attachments ?? []).filter((a) => a.type === 'PULL_REQUEST');
  const documents     = (task?.attachments ?? []).filter((a) => a.type !== 'SCREENSHOT' && a.type !== 'PULL_REQUEST');

  const statusTokens  = task ? (S[task.status] ?? S.TODO) : S.TODO;
  const overdueTask   = task?.dueDate ? isOverdueDate(task.dueDate, task.status) : false;
  const isTeamMemberViewer = user?.role === 'TEAM_MEMBER';
  const availableStatuses = isTeamMemberViewer && task
    ? Array.from(new Set([...TEAM_MEMBER_STATUSES, task.status]))
    : STATUSES;

  return (
    <>
      <Sheet open={!!taskId} onClose={onClose}>
        {/* ── Loading ── */}
        {(isLoading || !task) ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center animate-pulse">
                <CheckCircle2 className="h-6 w-6 text-indigo-300" />
              </div>
              {isLoading && <p className="text-sm font-medium">Loading task…</p>}
            </div>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <SheetHeader>
              {/* Status accent bar */}
              <div className={cn('h-1 w-full -mt-5 mb-4 rounded-full bg-gradient-to-r', statusTokens.grad)} />

              <div className="flex items-start gap-3 pr-8">
                {/* Status icon badge */}
                <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br shadow-sm', statusTokens.grad)}>
                  {(() => { const Icon = statusTokens.icon; return <Icon className="h-5 w-5 text-white" />; })()}
                </div>

                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base sm:text-lg font-bold leading-snug">{task.title}</SheetTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {/* Status pill */}
                    <span className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border', statusTokens.badge)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', statusTokens.dot)} />
                      {STATUS_LABELS[task.status] ?? task.status}
                    </span>
                    {/* Priority pill */}
                    <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold border', PRIORITY_STYLE[task.priority] ?? 'bg-muted text-muted-foreground border-border')}>
                      <Flag className="h-2.5 w-2.5 inline mr-1" />
                      {task.priority}
                    </span>
                    {overdueTask && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                        <Clock className="h-2.5 w-2.5" /> Overdue
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit / Delete */}
                {canEdit && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditOpen(true)}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-xl border border-border/60 bg-white text-xs font-semibold text-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all shadow-sm"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    {canDelete && (
                      confirmDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteMutation.mutate()}
                            disabled={deleteMutation.isPending}
                            className="h-8 px-3 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="h-8 px-2 rounded-xl border border-border/60 text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="h-8 w-8 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-all flex items-center justify-center shadow-sm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </SheetHeader>

            <SheetContent>
              <div className="space-y-5 pb-8">

                {/* ── Status change selector ── */}
                <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Update Status</p>
                  <Select value={task.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-full rounded-xl border-border/60 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {availableStatuses.map((s) => {
                        const tok = S[s] ?? S.TODO;
                        return (
                          <SelectItem key={s} value={s} className="rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className={cn('h-2 w-2 rounded-full', tok.dot)} />
                              {STATUS_LABELS[s]}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* ── In-review notice ── */}
                {task.status === 'IN_REVIEW' && (
                  <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/40 p-4 flex items-start gap-3">
                    <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800 font-medium">
                      Waiting for your manager or department head to approve this.
                    </p>
                  </div>
                )}

                {/* ── Blocker notice ── */}
                {task.blockerType && (
                  <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50/40 p-4 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-red-800 capitalize">
                        {task.blockerType.toLowerCase().replace(/_/g, ' ')}
                      </p>
                      {task.blockerExpectedResolution && (
                        <p className="text-xs text-red-600 mt-0.5">Expected by {formatDate(task.blockerExpectedResolution)}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Meta info card ── */}
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm divide-y divide-border/40 overflow-hidden">
                  {[
                    {
                      icon: User, label: 'Assignee',
                      content: task.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 ring-2 ring-white shadow-sm">
                            <AvatarImage src={task.assignee.avatarUrl} />
                            <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                              {getInitials(task.assignee.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{task.assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Unassigned</span>
                      ),
                    },
                    task.assignedBy && {
                      icon: User, label: 'Assigned by',
                      content: <span className="text-sm">{task.assignedBy.name}</span>,
                    },
                    task.createdAt && {
                      icon: Calendar, label: 'Created',
                      content: <span className="text-sm">{formatDateTime(task.createdAt)}</span>,
                    },
                    task.startDate && {
                      icon: Calendar, label: 'Start date',
                      content: <span className="text-sm font-semibold">{formatDateTime(task.startDate)}</span>,
                    },
                    task.dueDate && {
                      icon: Calendar, label: 'End date',
                      content: (
                        <span className={cn('text-sm font-semibold', overdueTask ? 'text-red-600' : 'text-foreground')}>
                          {formatDateTime(task.dueDate)}
                          {overdueTask && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold border border-red-200">Overdue</span>}
                        </span>
                      ),
                    },
                    ((task.startDate || task.createdAt) && task.dueDate) && (() => {
                      const isEng  = isEngineeringDept(task.department?.name);
                      const label  = workingDurationLabel(new Date(task.startDate || task.createdAt!), new Date(task.dueDate!), isEng);
                      if (!label) return null;
                      return {
                        icon: Clock, label: 'Duration',
                        content: (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                            {label}
                            <span className="text-[10px] font-normal text-muted-foreground">
                              (working days · {isEng ? 'Mon–Sat' : 'Mon–Fri'})
                            </span>
                          </span>
                        ),
                      };
                    })(),
                    task.department && {
                      icon: Building2, label: 'Department',
                      content: <span className="text-sm">{task.department.name}</span>,
                    },
                    task.team && (isEngineeringDept(user?.departmentName) || ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '')) && {
                      icon: Layers, label: 'Project',
                      content: (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
                          {task.team.name}
                        </span>
                      ),
                    },
                    (task as any).phase && {
                      icon: Layers, label: 'Phase',
                      content: (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                          {(task as any).phase.name}
                        </span>
                      ),
                    },
                    task.priority && {
                      icon: Flag, label: 'Priority',
                      content: (
                        <span className={cn('text-xs px-2.5 py-1 rounded-full font-bold border', PRIORITY_STYLE[task.priority] ?? 'bg-muted text-muted-foreground border-border')}>
                          {task.priority}
                        </span>
                      ),
                    },
                    (task.completionSubmittedAt && (task.status === 'IN_REVIEW' || task.status === 'DONE')) && {
                      icon: Calendar, label: 'Submitted',
                      content: <span className="text-sm">{formatDateTime(task.completionSubmittedAt)}</span>,
                    },
                    (task.status === 'DONE' && task.dueDate && (task.completionSubmittedAt || task.completedAt)) && (() => {
                      const isEng        = isEngineeringDept(task.department?.name);
                      const submittedStr = task.completionSubmittedAt || task.completedAt!;
                      const due          = new Date(task.dueDate!);
                      const submitted    = new Date(submittedStr);
                      const dueDay       = new Date(task.dueDate!); dueDay.setHours(0, 0, 0, 0);
                      const subDay       = new Date(submittedStr);   subDay.setHours(0, 0, 0, 0);
                      const isLate       = submitted > due;
                      const lateDays     = isLate ? countWorkingDays(dueDay, subDay, isEng) : 0;
                      return {
                        icon: CheckCircle2, label: 'Submission',
                        content: isLate ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600">
                            {lateDays <= 0 ? 'Late (same day)' : lateDays === 1 ? '1 working day late' : `${lateDays} working days late`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                            ✓ Submitted on time
                          </span>
                        ),
                      };
                    })(),
                    task.completionReviewedAt && task.completionReviewedBy && {
                      icon: CheckCircle2, label: 'Reviewed by',
                      content: <span className="text-sm">{task.completionReviewedBy.name} · {formatDateTime(task.completionReviewedAt)}</span>,
                    },
                  ].filter(Boolean).map((row, idx) => {
                    if (!row) return null;
                    const { icon: Icon, label, content } = row as { icon: React.ElementType; label: string; content: React.ReactNode };
                    return (
                      <div key={idx} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-6 w-6 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">{label}</span>
                        <div className="flex-1 min-w-0">{content}</div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Description ── */}
                {(task.description || task.expectedOutcome) && (
                  <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                    {task.description && (
                      <div className="px-4 py-4 border-b border-border/40 last:border-0">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Description</p>
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{task.description}</p>
                      </div>
                    )}
                    {task.expectedOutcome && (
                      <div className="px-4 py-4">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Expected Outcome</p>
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{task.expectedOutcome}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Delivery ── */}
                <div
                  ref={deliverySectionRef}
                  className={cn(
                    'rounded-2xl border shadow-sm overflow-hidden',
                    isOwnTask && totalDeliveries === 0 && !['DONE', 'CANCELLED', 'IN_REVIEW'].includes(task.status)
                      ? 'border-amber-300 bg-white ring-2 ring-amber-200/60'
                      : 'border-border/60 bg-white',
                  )}
                >
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Delivery</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Screenshots · Documents · PRs</p>
                    </div>
                    {canContribute && (
                      <div className="flex flex-wrap gap-1.5">
                        <input ref={screenshotInputRef} type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleAttachmentSelect(e, 'SCREENSHOT')} />
                        <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                          onChange={(e) => handleAttachmentSelect(e, 'DOCUMENT')} />

                        {[
                          {
                            key: 'SCREENSHOT', label: 'Screenshot', icon: ImagePlus,
                            onClick: () => screenshotInputRef.current?.click(),
                            loading: attachmentMutation.isPending,
                          },
                          {
                            key: 'DOCUMENT', label: 'Document', icon: FileText,
                            onClick: () => documentInputRef.current?.click(),
                            loading: attachmentMutation.isPending,
                          },
                          {
                            key: 'PULL_REQUEST', label: 'Raise PR', icon: GitPullRequest,
                            onClick: () => setPrFormOpen((v) => !v),
                            loading: false,
                          },
                        ].map(({ key, label, icon: Icon, onClick, loading }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={onClick}
                            disabled={loading}
                            className={cn(
                              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-xl border text-[10px] font-bold transition-all shadow-sm',
                              initialDeliveryAction === key
                                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                                : 'border-border/60 bg-white text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50',
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {loading ? 'Uploading…' : label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Required delivery warning for own open tasks */}
                    {isOwnTask && totalDeliveries === 0 && !['DONE', 'CANCELLED', 'IN_REVIEW'].includes(task.status) && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                        <span>
                          <span className="font-bold">Required before submitting —</span> Upload at least one screenshot, document, or PR link to prove delivery.
                        </span>
                      </div>
                    )}
                    {/* Delivery hint */}
                    {initialDeliveryAction && (
                      <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 font-medium">
                        <Zap className="h-3.5 w-3.5 shrink-0" />
                        {initialDeliveryAction === 'PULL_REQUEST'
                          ? 'Fill in the PR details below.'
                          : `Use the ${initialDeliveryAction === 'SCREENSHOT' ? 'Screenshot' : 'Document'} button to attach your update.`}
                      </div>
                    )}

                    {/* PR form */}
                    {prFormOpen && canContribute && (
                      <form onSubmit={handlePullRequestSubmit} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">PR Title</p>
                            <Input value={prTitle} onChange={(e) => setPrTitle(e.target.value)}
                              placeholder="feat: add new feature" className="h-9 rounded-xl text-sm border-border/60" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">PR URL</p>
                            <Input value={prUrl} onChange={(e) => setPrUrl(e.target.value)}
                              placeholder="https://github.com/…/pull/123" className="h-9 rounded-xl text-sm border-border/60" />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setPrFormOpen(false)}
                            className="h-8 px-3 rounded-xl border border-border/60 text-xs text-muted-foreground hover:bg-muted transition-colors">
                            Cancel
                          </button>
                          <button type="submit"
                            disabled={pullRequestMutation.isPending || !prTitle.trim() || !prUrl.trim()}
                            className="h-8 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 shadow-sm">
                            {pullRequestMutation.isPending ? 'Saving…' : 'Save PR'}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Attachment groups */}
                    <div className="space-y-2">
                      <AttachmentGroup title="Screenshots"    icon={<ImagePlus className="h-3.5 w-3.5" />}    iconBg="bg-sky-100 text-sky-600"      items={screenshots}  emptyLabel="No screenshots yet" canContribute={canContribute} onRemove={(id) => removeAttachmentMutation.mutate(id)} removingId={removeAttachmentMutation.variables} />
                      <AttachmentGroup title="Documents"      icon={<FileText className="h-3.5 w-3.5" />}     iconBg="bg-violet-100 text-violet-600" items={documents}    emptyLabel="No documents yet"   canContribute={canContribute} onRemove={(id) => removeAttachmentMutation.mutate(id)} removingId={removeAttachmentMutation.variables} />
                      <AttachmentGroup title="Pull Requests"  icon={<GitPullRequest className="h-3.5 w-3.5" />} iconBg="bg-emerald-100 text-emerald-600" items={pullRequests} emptyLabel="No PRs linked yet"  canContribute={canContribute} onRemove={(id) => removeAttachmentMutation.mutate(id)} removingId={removeAttachmentMutation.variables} />
                    </div>
                  </div>
                </div>

                {/* ── Status History ── */}
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Activity & History</p>
                  </div>
                  <div className="p-4">
                    {(!task.statusHistories || task.statusHistories.length === 0) ? (
                      <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                        <Clock className="h-8 w-8 opacity-20" />
                        <p className="text-sm">No status changes yet.</p>
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gradient-to-b from-border/80 to-transparent" />
                        <div className="space-y-5">
                          {task.statusHistories.map((h) => {
                            const tok = S[h.toStatus] ?? S.TODO;
                            return (
                              <div key={h.id} className="relative flex gap-4">
                                {/* Dot */}
                                <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 z-10 bg-gradient-to-br shadow-sm', tok.grad)}>
                                  {(() => { const Icon = tok.icon; return <Icon className="h-3.5 w-3.5 text-white" />; })()}
                                </div>

                                <div className="flex-1 min-w-0 pb-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {h.fromStatus && (
                                      <>
                                        <span className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border', S[h.fromStatus]?.badge ?? 'bg-muted text-muted-foreground border-border')}>
                                          {STATUS_LABELS[h.fromStatus] || h.fromStatus}
                                        </span>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                      </>
                                    )}
                                    <span className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border', tok.badge)}>
                                      {STATUS_LABELS[h.toStatus] || h.toStatus}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    <span className="font-semibold text-foreground/70">{h.changedBy.name}</span>
                                    {' · '}{formatRelative(h.changedAt)}
                                  </p>

                                  {h.blockerType && (
                                    <div className="mt-2 rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700">
                                      <span className="font-bold capitalize">{h.blockerType.toLowerCase().replace(/_/g, ' ')}</span>
                                      {h.blockerDescription && ` — ${h.blockerDescription}`}
                                      {h.blockerExpectedResolution && (
                                        <span className="block mt-0.5 text-red-500">By {formatDate(h.blockerExpectedResolution)}</span>
                                      )}
                                    </div>
                                  )}

                                  {h.suggestions && Array.isArray(h.suggestions) && h.suggestions.length > 0 && (
                                    <div className="mt-2 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50/60 p-3 space-y-2">
                                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                                        <Sparkles className="h-3 w-3" /> AI Suggestions
                                      </div>
                                      <ol className="text-xs space-y-1.5 text-muted-foreground list-decimal list-inside pl-1">
                                        {h.suggestions.map((s, i) => (
                                          <li key={i} className="leading-relaxed hover:text-foreground transition-colors">
                                            {typeof s === 'string' ? s : Object.values(s as Record<string, unknown>).map(String).join(' ')}
                                          </li>
                                        ))}
                                      </ol>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Comments ── */}
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Comments</p>
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">{task.comments.length}</span>
                  </div>
                  <div className="p-4">
                    {task.comments.length === 0 ? (
                      <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                        <Send className="h-7 w-7 opacity-20" />
                        <p className="text-sm">No comments yet. Start the discussion.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 mb-5">
                        {task.comments.map((c) => (
                          <div key={c.id} className="flex gap-3">
                            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white shadow-sm">
                              <AvatarImage src={c.user.avatarUrl} />
                              <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                                {getInitials(c.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/20 px-3.5 py-2.5">
                                <div className="flex items-baseline gap-2 mb-1">
                                  <span className="text-xs font-bold text-foreground">{c.user.name}</span>
                                  <span className="text-[10px] text-muted-foreground">{formatRelative(c.createdAt)}</span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/80">{c.content}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Comment input */}
                    <form onSubmit={handleCommentSubmit} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Textarea
                          placeholder="Write a comment… (Enter to send, Shift+Enter for newline)"
                          rows={2}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(e as unknown as React.FormEvent); }
                          }}
                          className="text-sm resize-none rounded-2xl border-border/60 focus-visible:ring-indigo-300 focus-visible:border-indigo-300"
                        />
                      </div>
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!comment.trim() || commentMutation.isPending}
                        className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 border-0 shadow-sm shadow-indigo-200 shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>

              </div>
            </SheetContent>
          </>
        )}
      </Sheet>

      <BlockerDialog
        open={blockerOpen}
        taskTitle={task?.title ?? ''}
        onConfirm={handleBlockerConfirm}
        onCancel={() => { setBlockerOpen(false); setPendingStatus(null); }}
        isLoading={updateMutation.isPending}
      />
      {canEdit && taskToEdit && (
        <NewTaskDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task', taskId] }); }}
          taskToEdit={taskToEdit}
        />
      )}
    </>
  );
}

// ── AttachmentGroup ───────────────────────────────────────────────────────────
function AttachmentGroup({
  title, icon, iconBg, items, emptyLabel, canContribute, onRemove, removingId,
}: {
  title: string; icon: React.ReactNode; iconBg: string;
  items: TaskAttachment[]; emptyLabel: string;
  canContribute: boolean; onRemove: (id: string) => void; removingId?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className={cn('h-6 w-6 rounded-lg flex items-center justify-center', iconBg)}>{icon}</div>
          <p className="text-xs font-bold">{title}</p>
        </div>
        <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-2 py-0.5">{items.length}</span>
      </div>
      <div className="p-2 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">{emptyLabel}</p>
        ) : (
          items.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-white px-3 py-2.5 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate group-hover:text-indigo-700 transition-colors">{a.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelative(a.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={resolveAttachmentUrl(a.url)}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                >
                  {a.type === 'PULL_REQUEST' ? <Link2 className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                  Open
                </a>
                {canContribute && (
                  <button
                    type="button"
                    onClick={() => onRemove(a.id)}
                    disabled={removingId === a.id}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
