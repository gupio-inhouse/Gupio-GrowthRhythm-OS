import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Calendar, User, Flag, Building2, Target, AlertTriangle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { BlockerDialog } from './BlockerDialog';
import { cn, statusColor, priorityColor, formatDate, formatRelative, getInitials } from '@/lib/utils';
import api from '@/api/client';

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

export function TaskDetailDrawer({ taskId, onClose }: Props) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

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
                <div className="flex-1">
                  <SheetTitle>{task.title}</SheetTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={cn('text-xs border', statusColor(task.status))}>{task.status.replace('_', ' ')}</Badge>
                    <Badge className={cn('text-xs border', priorityColor(task.priority))}>{task.priority}</Badge>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <SheetContent>
              <div className="space-y-6">
                {/* Status change */}
                <div className="flex items-center gap-3">
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
                    <div className="flex items-center gap-3">
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
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Due date</span>
                      <span className={cn('text-sm', new Date(task.dueDate) < new Date() && task.status !== 'DONE' ? 'text-red-500 font-medium' : '')}>
                        {formatDate(task.dueDate)}
                      </span>
                    </div>
                  )}

                  {task.department && (
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Department</span>
                      <span className="text-sm">{task.department.name}</span>
                    </div>
                  )}

                  {task.kra && (
                    <div className="flex items-center gap-3">
                      <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">KRA</span>
                      <span className="text-sm">{task.kra.name}</span>
                    </div>
                  )}

                  {task.blockerType && (
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-sm text-muted-foreground w-24">Blocker</span>
                      <span className="text-sm text-red-600 font-medium capitalize">
                        {task.blockerType.toLowerCase().replace(/_/g, ' ')}
                        {task.blockerExpectedResolution && ` · by ${formatDate(task.blockerExpectedResolution)}`}
                      </span>
                    </div>
                  )}

                  {task.priority && (
                    <div className="flex items-center gap-3">
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
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium">{c.user.name}</span>
                            <span className="text-xs text-muted-foreground">{formatRelative(c.createdAt)}</span>
                          </div>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.content}</p>
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
    </>
  );
}
