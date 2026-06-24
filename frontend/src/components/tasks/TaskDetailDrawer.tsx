import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Calendar, User, Flag, Building2, AlertTriangle, Pencil, Trash2, ImagePlus, FileText, GitPullRequest, ExternalLink, Link2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { BlockerDialog } from './BlockerDialog';
import { NewTaskDialog, type TaskToEdit } from './NewTaskDialog';
import { cn, statusColor, priorityColor, formatDate, formatRelative, getInitials } from '@/lib/utils';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; avatarUrl?: string };
};

type TaskAttachment = {
  id: string;
  name: string;
  url: string;
  type: string;
  size?: number | null;
  createdAt: string;
};

type TaskStatusHistory = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  changedBy: { id: string; name: string; avatarUrl?: string };
  blockerType?: string | null;
  blockerDescription?: string | null;
  blockerExpectedResolution?: string | null;
  suggestions?: string[] | null;
};

type TaskDetail = {
  id: string;
  title: string;
  description?: string;
  expectedOutcome?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completionSubmittedAt?: string;
  completedAt?: string;
  completionReviewedAt?: string;
  blockerType?: string;
  blockerExpectedResolution?: string;
  assignee: { id: string; name: string; avatarUrl?: string };
  assignedBy?: { id: string; name: string };
  completionReviewedBy?: { id: string; name: string };
  department?: { id: string; name: string };
  comments: Comment[];
  attachments: TaskAttachment[];
  statusHistories: TaskStatusHistory[];
};

const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'];
const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  IN_REVIEW: 'Pending Review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

interface Props {
  taskId: string | null;
  initialDeliveryAction?: 'SCREENSHOT' | 'DOCUMENT' | 'PULL_REQUEST' | null;
  onClose: () => void;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours(), m = d.getMinutes();
  const datePart = formatDate(dateStr);
  if (h === 0 && m === 0) return datePart;
  return `${datePart} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTaskError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data
  ) {
    const responseError = error.response.data.error;
    if (typeof responseError === 'string') return responseError;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function resolveAttachmentUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const baseUrl = api.defaults.baseURL;
  if (typeof baseUrl === 'string' && /^https?:\/\//i.test(baseUrl)) {
    return new URL(url, baseUrl).toString();
  }
  return url;
}

export function TaskDetailDrawer({ taskId, initialDeliveryAction = null, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [comment, setComment] = useState('');
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliverySuccess, setDeliverySuccess] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [prFormOpen, setPrFormOpen] = useState(false);
  const deliverySectionRef = useRef<HTMLDivElement | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const canEditAsManager = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canContribute = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(user?.role || '');

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then((r) => r.data),
    enabled: !!taskId,
  });

  const canEdit = canEditAsManager || (user?.role === 'TEAM_MEMBER' && !!task && task.assignee?.id === user?.id);

  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/tasks/${taskId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/tasks/${taskId}/comments`, { content }),
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  const attachmentMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: 'SCREENSHOT' | 'DOCUMENT' }) => {
      const formData = new FormData();
      formData.append('file', file);
      const uploadResponse = await api.post('/upload/content', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return api.post(`/tasks/${taskId}/attachments`, {
        name: uploadResponse.data.originalName,
        url: uploadResponse.data.url,
        type,
        size: uploadResponse.data.size,
      });
    },
    onSuccess: (_result, variables) => {
      setDeliveryError(null);
      setDeliverySuccess(variables.type === 'SCREENSHOT' ? 'Screenshot added.' : 'Document added.');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: (error) => {
      setDeliverySuccess(null);
      setDeliveryError(formatTaskError(error));
    },
  });

  const pullRequestMutation = useMutation({
    mutationFn: ({ title, url }: { title: string; url: string }) =>
      api.post(`/tasks/${taskId}/pull-requests`, { title, url }),
    onSuccess: () => {
      setPrTitle('');
      setPrUrl('');
      setPrFormOpen(false);
      setDeliveryError(null);
      setDeliverySuccess('PR linked to task.');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: (error) => {
      setDeliverySuccess(null);
      setDeliveryError(formatTaskError(error));
    },
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => api.delete(`/tasks/${taskId}/attachments/${attachmentId}`),
    onSuccess: () => {
      setDeliveryError(null);
      setDeliverySuccess('Item removed.');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: (error) => {
      setDeliverySuccess(null);
      setDeliveryError(formatTaskError(error));
    },
  });

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'BLOCKED') {
      setPendingStatus(newStatus);
      setBlockerOpen(true);
    } else {
      updateMutation.mutate({ status: newStatus });
    }
  };

  const handleBlockerConfirm = (data: { blockerType: string; blockerDescription: string; blockerExpectedResolution?: string }) => {
    updateMutation.mutate({
      status: 'BLOCKED',
      blockerType: data.blockerType,
      blockerDescription: data.blockerDescription,
      blockerExpectedResolution: data.blockerExpectedResolution
        ? new Date(data.blockerExpectedResolution).toISOString()
        : undefined,
    });
    setBlockerOpen(false);
    setPendingStatus(null);
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    commentMutation.mutate(comment.trim());
  };

  const handleAttachmentSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: 'SCREENSHOT' | 'DOCUMENT'
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setDeliverySuccess(null);
    setDeliveryError(null);
    await attachmentMutation.mutateAsync({ file, type });
  };

  const handlePullRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prTitle.trim() || !prUrl.trim()) return;
    setDeliverySuccess(null);
    setDeliveryError(null);
    await pullRequestMutation.mutateAsync({ title: prTitle.trim(), url: prUrl.trim() });
  };

  const taskToEdit: TaskToEdit | null = task
    ? {
        id: task.id,
        title: task.title,
        description: task.description,
        expectedOutcome: task.expectedOutcome,
        priority: task.priority,
        dueDate: task.dueDate,
        assignee: task.assignee,
        department: task.department,
      }
    : null;

  const screenshots = (task?.attachments || []).filter((attachment) => attachment.type === 'SCREENSHOT');
  const pullRequests = (task?.attachments || []).filter((attachment) => attachment.type === 'PULL_REQUEST');
  const documents = (task?.attachments || []).filter((attachment) => attachment.type !== 'SCREENSHOT' && attachment.type !== 'PULL_REQUEST');

  useEffect(() => {
    if (!task || !initialDeliveryAction) return;
    setDeliveryError(null);
    setDeliverySuccess(null);
    setPrFormOpen(initialDeliveryAction === 'PULL_REQUEST');
    requestAnimationFrame(() => {
      deliverySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [initialDeliveryAction, task]);

  return (
    <>
      <Sheet open={!!taskId} onClose={onClose}>
        {isLoading || !task ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {isLoading ? 'Loading...' : ''}
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3 pr-8">
                <div className="flex-1 min-w-0">
                  <SheetTitle>{task.title}</SheetTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className={cn('text-xs border', statusColor(task.status))}>{STATUS_LABELS[task.status] ?? task.status.replace('_', ' ')}</Badge>
                    <Badge className={cn('text-xs border', priorityColor(task.priority))}>{task.priority}</Badge>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setEditOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    {confirmDelete ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate()}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </SheetHeader>

            <SheetContent>
              <div className="space-y-6">
                {/* Status change */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-muted-foreground w-28">Status</span>
                  <Select value={task.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-1 gap-3">
                  {task.status === 'IN_REVIEW' && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {task.assignedBy
                        ? `Waiting for ${task.assignedBy.name} to review this completed task.`
                        : 'Waiting for reviewer approval on this completed task.'}
                    </div>
                  )}

                  {task.assignee && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Assignee</span>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={task.assignee.avatarUrl} />
                          <AvatarFallback className="text-xs">{getInitials(task.assignee.name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{task.assignee.name}</span>
                      </div>
                    </div>
                  )}

                  {task.assignedBy && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Assigned by</span>
                      <span className="text-sm">{task.assignedBy.name}</span>
                    </div>
                  )}

                  {task.dueDate && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Due date</span>
                      <span className={cn('text-sm', new Date(task.dueDate) < new Date() && task.status !== 'DONE' ? 'text-red-500 font-medium' : '')}>
                        {formatDateTime(task.dueDate)}
                      </span>
                    </div>
                  )}

                  {task.department && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Department</span>
                      <span className="text-sm">{task.department.name}</span>
                    </div>
                  )}

                  {task.blockerType && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Blocker</span>
                      <span className="text-sm text-red-600 font-medium capitalize">
                        {task.blockerType.toLowerCase().replace(/_/g, ' ')}
                        {task.blockerExpectedResolution && ` · by ${formatDate(task.blockerExpectedResolution)}`}
                      </span>
                    </div>
                  )}

                  {task.priority && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Flag className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Priority</span>
                      <span className="text-sm">{task.priority}</span>
                    </div>
                  )}

                  {task.completionSubmittedAt && task.status === 'IN_REVIEW' && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Submitted</span>
                      <span className="text-sm">{formatDateTime(task.completionSubmittedAt)}</span>
                    </div>
                  )}

                  {task.completionReviewedAt && task.completionReviewedBy && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Reviewed</span>
                      <span className="text-sm">
                        {task.completionReviewedBy.name} · {formatDateTime(task.completionReviewedAt)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Description */}
                {task.description && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-1.5">Description</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
                    </div>
                  </>
                )}

                {task.expectedOutcome && (
                  <div>
                    <p className="text-sm font-medium mb-1.5">Expected Outcome</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.expectedOutcome}</p>
                  </div>
                )}

                <Separator />
                <div ref={deliverySectionRef} className="space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">Delivery</p>
                      <p className="text-xs text-muted-foreground mt-1">Add screenshots, documents, and PR links for this task.</p>
                    </div>
                    {canContribute && (
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={screenshotInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => handleAttachmentSelect(event, 'SCREENSHOT')}
                        />
                        <input
                          ref={documentInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          onChange={(event) => handleAttachmentSelect(event, 'DOCUMENT')}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn('gap-1.5', initialDeliveryAction === 'SCREENSHOT' && 'border-primary text-primary bg-primary/5')}
                          onClick={() => screenshotInputRef.current?.click()}
                          disabled={attachmentMutation.isPending}
                        >
                          <ImagePlus className="h-3.5 w-3.5" />
                          {attachmentMutation.isPending ? 'Uploading…' : 'Add Screenshot'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn('gap-1.5', initialDeliveryAction === 'DOCUMENT' && 'border-primary text-primary bg-primary/5')}
                          onClick={() => documentInputRef.current?.click()}
                          disabled={attachmentMutation.isPending}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {attachmentMutation.isPending ? 'Uploading…' : 'Add Document'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn('gap-1.5', initialDeliveryAction === 'PULL_REQUEST' && 'border-primary text-primary bg-primary/5')}
                          onClick={() => {
                            setDeliveryError(null);
                            setDeliverySuccess(null);
                            setPrFormOpen((value) => !value);
                          }}
                        >
                          <GitPullRequest className="h-3.5 w-3.5" />
                          Raise PR
                        </Button>
                      </div>
                    )}
                  </div>

                  {initialDeliveryAction && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                      {initialDeliveryAction === 'PULL_REQUEST'
                        ? 'Add the pull request details below.'
                        : `Use the ${initialDeliveryAction === 'SCREENSHOT' ? 'Add Screenshot' : 'Add Document'} button to attach this task update.`}
                    </div>
                  )}

                  {prFormOpen && canContribute && (
                    <form onSubmit={handlePullRequestSubmit} className="rounded-lg border bg-muted/30 p-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">PR title</p>
                          <Input
                            value={prTitle}
                            onChange={(e) => setPrTitle(e.target.value)}
                            placeholder="feat(tasks): add delivery actions"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">PR URL</p>
                          <Input
                            value={prUrl}
                            onChange={(e) => setPrUrl(e.target.value)}
                            placeholder="https://github.com/org/repo/pull/123"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setPrFormOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={pullRequestMutation.isPending || !prTitle.trim() || !prUrl.trim()}
                        >
                          {pullRequestMutation.isPending ? 'Saving…' : 'Save PR'}
                        </Button>
                      </div>
                    </form>
                  )}

                  {(deliveryError || deliverySuccess) && (
                    <div className={cn(
                      'rounded-md border px-3 py-2 text-xs',
                      deliveryError ? 'border-red-200 bg-red-50 text-red-600' : 'border-green-200 bg-green-50 text-green-700'
                    )}>
                      {deliveryError || deliverySuccess}
                    </div>
                  )}

                  <div className="space-y-3">
                    <AttachmentGroup
                      title="Screenshots"
                      icon={<ImagePlus className="h-4 w-4 text-muted-foreground" />}
                      items={screenshots}
                      emptyLabel="No screenshots added yet."
                      canContribute={canContribute}
                      onRemove={(attachmentId) => removeAttachmentMutation.mutate(attachmentId)}
                      removingId={removeAttachmentMutation.variables}
                    />
                    <AttachmentGroup
                      title="Documents"
                      icon={<FileText className="h-4 w-4 text-muted-foreground" />}
                      items={documents}
                      emptyLabel="No documents added yet."
                      canContribute={canContribute}
                      onRemove={(attachmentId) => removeAttachmentMutation.mutate(attachmentId)}
                      removingId={removeAttachmentMutation.variables}
                    />
                    <AttachmentGroup
                      title="Pull Requests"
                      icon={<GitPullRequest className="h-4 w-4 text-muted-foreground" />}
                      items={pullRequests}
                      emptyLabel="No PR linked yet."
                      canContribute={canContribute}
                      onRemove={(attachmentId) => removeAttachmentMutation.mutate(attachmentId)}
                      removingId={removeAttachmentMutation.variables}
                    />
                  </div>
                </div>

                {/* Status History & Suggestions */}
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-3">Status History & Better Options</p>
                  {(!task.statusHistories || task.statusHistories.length === 0) ? (
                    <p className="text-sm text-muted-foreground">No status changes captured yet.</p>
                  ) : (
                    <div className="relative border-l pl-4 ml-2 space-y-4">
                      {task.statusHistories.map((history) => (
                        <div key={history.id} className="relative group">
                          {/* Timeline dot */}
                          <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary border border-background ring-4 ring-background" />
                          
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {history.fromStatus && (
                                <>
                                  <Badge variant="outline" className="text-[10px] scale-95 origin-left">
                                    {STATUS_LABELS[history.fromStatus] || history.fromStatus}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">→</span>
                                </>
                              )}
                              <Badge className={cn('text-[11px] font-medium border', statusColor(history.toStatus))}>
                                {STATUS_LABELS[history.toStatus] || history.toStatus}
                              </Badge>
                              <span className="text-xs text-muted-foreground font-light">
                                by <span className="font-normal text-foreground">{history.changedBy.name}</span> · {formatRelative(history.changedAt)}
                              </span>
                            </div>

                            {history.blockerType && (
                              <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded px-2.5 py-1.5 block max-w-lg">
                                <span className="font-semibold capitalize">
                                  Blocked ({history.blockerType.toLowerCase().replace(/_/g, ' ')})
                                </span>
                                {history.blockerDescription && `: ${history.blockerDescription}`}
                                {history.blockerExpectedResolution && ` (Expected resolution: ${formatDate(history.blockerExpectedResolution)})`}
                              </div>
                            )}

                            {history.suggestions && Array.isArray(history.suggestions) && history.suggestions.length > 0 && (
                              <div className="rounded-lg bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border border-violet-100 dark:border-violet-900/30 p-3 space-y-2 mt-2 max-w-lg">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-300">
                                  <span className="animate-pulse">✨</span> AI-Suggested Better Options & Next Steps:
                                </div>
                                <ul className="text-xs space-y-1.5 text-muted-foreground list-decimal list-inside pl-1">
                                  {history.suggestions.map((suggestion, idx) => (
                                    <li key={idx} className="leading-relaxed hover:text-foreground transition-colors">
                                      {suggestion}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comments */}
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-3">Comments ({task.comments.length})</p>
                  <div className="space-y-4">
                    {task.comments.length === 0 && (
                      <p className="text-sm text-muted-foreground">No comments yet.</p>
                    )}
                    {task.comments.map((c) => (
                      <div key={c.id} className="flex gap-3">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={c.user.avatarUrl} />
                          <AvatarFallback className="text-xs">{getInitials(c.user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-medium">{c.user.name}</span>
                            <span className="text-xs text-muted-foreground">{formatRelative(c.createdAt)}</span>
                          </div>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add comment */}
                  <form onSubmit={handleCommentSubmit} className="mt-4 flex gap-2">
                    <Textarea
                      placeholder="Add a comment..."
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleCommentSubmit(e as unknown as React.FormEvent);
                        }
                      }}
                      className="flex-1 text-sm resize-none"
                    />
                    <Button type="submit" size="icon" disabled={!comment.trim() || commentMutation.isPending}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
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
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['tasks'] });
            qc.invalidateQueries({ queryKey: ['task', taskId] });
          }}
          taskToEdit={taskToEdit}
        />
      )}
    </>
  );
}

function AttachmentGroup({
  title,
  icon,
  items,
  emptyLabel,
  canContribute,
  onRemove,
  removingId,
}: {
  title: string;
  icon: React.ReactNode;
  items: TaskAttachment[];
  emptyLabel: string;
  canContribute: boolean;
  onRemove: (attachmentId: string) => void;
  removingId?: string;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm font-medium">{title}</p>
        </div>
        <Badge variant="secondary" className="text-xs">{items.length}</Badge>
      </div>
      <div className="p-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((attachment) => (
            <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{attachment.name}</p>
                <p className="text-xs text-muted-foreground">{formatRelative(attachment.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={resolveAttachmentUrl(attachment.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {attachment.type === 'PULL_REQUEST' ? <Link2 className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Open
                </a>
                {canContribute && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-destructive hover:text-destructive"
                    disabled={removingId === attachment.id}
                    onClick={() => onRemove(attachment.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
