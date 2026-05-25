import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Calendar, User, Flag, Building2, Target, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

type TaskDetail = {
  id: string;
  title: string;
  description?: string;
  expectedOutcome?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completedAt?: string;
  blockerType?: string;
  blockerExpectedResolution?: string;
  assignee: { id: string; name: string; avatarUrl?: string };
  kra?: { id: string; name: string };
  department?: { id: string; name: string };
  comments: Comment[];
};

const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

interface Props {
  taskId: string | null;
  onClose: () => void;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours(), m = d.getMinutes();
  const datePart = formatDate(dateStr);
  if (h === 0 && m === 0) return datePart;
  return `${datePart} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TaskDetailDrawer({ taskId, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [comment, setComment] = useState('');
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then((r) => r.data),
    enabled: !!taskId,
  });

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

  const taskToEdit: TaskToEdit | null = task
    ? {
        id: task.id,
        title: task.title,
        description: task.description,
        expectedOutcome: task.expectedOutcome,
        priority: task.priority,
        dueDate: task.dueDate,
        assignee: task.assignee,
        kra: task.kra,
        department: task.department,
      }
    : null;

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
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <SheetTitle>{task.title}</SheetTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className={cn('text-xs border', statusColor(task.status))}>{task.status.replace('_', ' ')}</Badge>
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
                        <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-1 gap-3">
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

                  {task.kra && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">KRA</span>
                      <span className="text-sm">{task.kra.name}</span>
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
