import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, CheckSquare, AlertTriangle, Clock, Search, LayoutGrid, List, Upload, ImagePlus, FileText, GitPullRequest, CalendarDays, Check, X as XIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, statusColor, priorityColor, formatDate, getInitials } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { BlockerDialog } from '@/components/tasks/BlockerDialog';
import { NewTaskDialog } from '@/components/tasks/NewTaskDialog';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';

type Task = {
  id: string; title: string; status: string; priority: string;
  dueDate?: string;
  assignee?: { id: string; name: string; avatarUrl?: string };
  department?: { id: string; name: string };
  blockerType?: string;
  _count?: { comments: number; attachments: number };
};

type DeliveryAction = 'SCREENSHOT' | 'DOCUMENT' | 'PULL_REQUEST';

const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'];
const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked', IN_REVIEW: 'Pending Review', DONE: 'Done', CANCELLED: 'Cancelled',
};
const STATUS_COLORS: Record<string, string> = {
  TODO: 'border-gray-200',
  IN_PROGRESS: 'border-blue-200',
  BLOCKED: 'border-red-200',
  IN_REVIEW: 'border-amber-200',
  DONE: 'border-green-200',
  CANCELLED: 'border-gray-100',
};

function DueBadge({ dueDate, status, className }: { dueDate: string; status: string; className?: string }) {
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const dueDay = new Date(dueDate); dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  const done = status === 'DONE' || status === 'CANCELLED';

  if (done) {
    return <span className={cn('text-xs text-muted-foreground', className)}>{formatDate(dueDate)}</span>;
  }
  if (due < now) {
    if (diffDays === 0) {
      return (
        <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200', className)}>
          Overdue
        </span>
      );
    }
    const days = Math.abs(diffDays);
    return (
      <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200', className)}>
        {days === 1 ? '1 day overdue' : `${days}d overdue`}
      </span>
    );
  }
  if (diffDays === 0) {
    return <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200', className)}>Due today</span>;
  }
  if (diffDays === 1) {
    return <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-200', className)}>Tomorrow</span>;
  }
  if (diffDays <= 3) {
    return <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200', className)}>In {diffDays}d</span>;
  }
  return <span className={cn('text-xs text-muted-foreground', className)}>{formatDate(dueDate)}</span>;
}

export default function Tasks() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const deliveryAction = (searchParams.get('delivery') as DeliveryAction | null) ?? null;

  // Sync filter when URL param changes (e.g. navigating from dashboard)
  useEffect(() => {
    const s = searchParams.get('status') ?? '';
    setStatusFilter(s);
    setSelectedTaskId(searchParams.get('taskId'));
  }, [searchParams]);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => searchParams.get('taskId'));
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const canCreateTasks = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(user?.role || '');
  const canExtend = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');

  // Blocker dialog state (for inline list status change)
  const [blockerCtx, setBlockerCtx] = useState<{ taskId: string; taskTitle: string } | null>(null);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/tasks/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const handleStatusChange = (task: Task, newStatus: string) => {
    if (newStatus === 'BLOCKED') {
      setBlockerCtx({ taskId: task.id, taskTitle: task.title });
    } else {
      updateMutation.mutate({ id: task.id, patch: { status: newStatus } });
    }
  };

  const handleExtendDeadline = (taskId: string, newDate: string) => {
    updateMutation.mutate({ id: taskId, patch: { dueDate: new Date(`${newDate}T23:59:59`).toISOString() } });
  };

  const handleBlockerConfirm = (data: { blockerType: string; blockerDescription: string; blockerExpectedResolution?: string }) => {
    if (!blockerCtx) return;
    updateMutation.mutate({
      id: blockerCtx.taskId,
      patch: {
        status: 'BLOCKED',
        blockerType: data.blockerType,
        blockerExpectedResolution: data.blockerExpectedResolution
          ? new Date(data.blockerExpectedResolution).toISOString()
          : undefined,
      },
    });
    setBlockerCtx(null);
  };

  const openTask = (taskId: string, delivery?: DeliveryAction) => {
    const next = new URLSearchParams(searchParams);
    next.set('taskId', taskId);
    if (delivery) next.set('delivery', delivery);
    else next.delete('delivery');
    setSearchParams(next);
  };

  const closeTask = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('taskId');
    next.delete('delivery');
    setSearchParams(next);
  };

  const canSearchByUser = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');

  const now = new Date();
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const isTaskOverdue = (t: Task) => {
    if (!t.dueDate || t.status === 'DONE' || t.status === 'CANCELLED') return false;
    const d = new Date(t.dueDate);
    return d < now;
  };
  const isTaskDueToday = (t: Task) => {
    if (!t.dueDate || t.status === 'DONE' || t.status === 'CANCELLED') return false;
    const d = new Date(t.dueDate);
    return d >= now && d <= endOfToday;
  };

  const filtered = tasks
    .filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesAssignee = canSearchByUser && t.assignee?.name.toLowerCase().includes(q);
        if (!matchesTitle && !matchesAssignee) return false;
      }
      if (statusFilter === 'overdue') return isTaskOverdue(t);
      if (statusFilter === 'due_today') return isTaskDueToday(t);
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      // Done/cancelled always last
      const aInactive = a.status === 'DONE' || a.status === 'CANCELLED';
      const bInactive = b.status === 'DONE' || b.status === 'CANCELLED';
      if (aInactive !== bInactive) return aInactive ? 1 : -1;
      // Among active: overdue first, then due today, then nearest future, then no date
      const urgency = (t: Task) => {
        if (isTaskOverdue(t)) return 0;
        if (isTaskDueToday(t)) return 1;
        if (t.dueDate) return 2;
        return 3;
      };
      const uA = urgency(a), uB = urgency(b);
      if (uA !== uB) return uA - uB;
      // Same urgency bucket — sort by date ascending (nearest first)
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    });

  const statusCounts = {
    TODO: tasks.filter((t) => t.status === 'TODO').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    BLOCKED: tasks.filter((t) => t.status === 'BLOCKED').length,
    IN_REVIEW: tasks.filter((t) => t.status === 'IN_REVIEW').length,
    DONE: tasks.filter((t) => t.status === 'DONE').length,
  };

  return (
    <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{tasks.length} total tasks</p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={cn('px-2.5 py-1.5 transition-colors', view === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={cn('px-2.5 py-1.5 transition-colors', view === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          {canCreateTasks && ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '') && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setCsvImportOpen(true)}>
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import CSV</span>
            </Button>
          )}
          {canCreateTasks && (
            <Button size="sm" className="gap-2" onClick={() => setNewTaskOpen(true)}>
              <Plus className="h-4 w-4" />
              {user?.role === 'TEAM_MEMBER' ? 'Add My Task' : 'New Task'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: 'To Do', key: 'TODO', color: 'bg-gray-100 text-gray-700', icon: CheckSquare },
          { label: 'In Progress', key: 'IN_PROGRESS', color: 'bg-blue-50 text-blue-700', icon: Clock },
          { label: 'Blocked', key: 'BLOCKED', color: 'bg-red-50 text-red-700', icon: AlertTriangle },
          { label: 'Review', key: 'IN_REVIEW', color: 'bg-amber-50 text-amber-700', icon: Clock },
          { label: 'Done', key: 'DONE', color: 'bg-green-50 text-green-700', icon: CheckSquare },
        ].map(({ label, key, color, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
            className={cn('rounded-xl border p-3 sm:p-4 text-left transition-all hover:shadow-sm', color,
              statusFilter === key && 'ring-2 ring-primary')}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-medium">{label}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold mt-1.5 sm:mt-2">{statusCounts[key as keyof typeof statusCounts]}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={canSearchByUser ? 'Search by task or person…' : 'Search tasks…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 flex-nowrap">
          {(['', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0',
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              {s ? STATUS_LABELS[s] : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : view === 'list' ? (
        <ListView tasks={filtered} onStatusChange={handleStatusChange} onTaskClick={openTask} onDeliveryClick={openTask} canExtend={canExtend} onExtendDeadline={handleExtendDeadline} />
      ) : (
        <KanbanView tasks={filtered} onStatusChange={handleStatusChange} onTaskClick={openTask} onDeliveryClick={openTask} canExtend={canExtend} onExtendDeadline={handleExtendDeadline} />
      )}

      {/* Dialogs / Drawers */}
      {canCreateTasks && (
        <NewTaskDialog
          open={newTaskOpen}
          onClose={() => setNewTaskOpen(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['tasks'] })}
          taskToEdit={null}
        />
      )}

      <TaskDetailDrawer
        taskId={selectedTaskId}
        initialDeliveryAction={deliveryAction}
        onClose={closeTask}
      />

      <BlockerDialog
        open={!!blockerCtx}
        taskTitle={blockerCtx?.taskTitle ?? ''}
        onConfirm={handleBlockerConfirm}
        onCancel={() => setBlockerCtx(null)}
        isLoading={updateMutation.isPending}
      />

      {canCreateTasks && (
        <CsvImportDialog
          open={csvImportOpen}
          onClose={() => setCsvImportOpen(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['tasks'] });
            setCsvImportOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── List view ────────────────────────────────────────────────────────────────

function ListView({
  tasks, onStatusChange, onTaskClick, onDeliveryClick, canExtend, onExtendDeadline,
}: {
  tasks: Task[];
  onStatusChange: (task: Task, status: string) => void;
  onTaskClick: (id: string, delivery?: DeliveryAction) => void;
  onDeliveryClick: (id: string, delivery: DeliveryAction) => void;
  canExtend?: boolean;
  onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <p>No tasks found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onStatusChange={onStatusChange}
          onClick={() => onTaskClick(task.id)}
          onDeliveryClick={(delivery) => onDeliveryClick(task.id, delivery)}
          canExtend={canExtend}
          onExtendDeadline={onExtendDeadline}
        />
      ))}
    </div>
  );
}

function TaskRow({ task, onStatusChange, onClick, onDeliveryClick, canExtend, onExtendDeadline }: {
  task: Task;
  onStatusChange: (task: Task, status: string) => void;
  onClick: () => void;
  onDeliveryClick: (delivery: DeliveryAction) => void;
  canExtend?: boolean;
  onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [newDate, setNewDate] = useState(task.dueDate ? task.dueDate.split('T')[0] : '');

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  function submitExtend(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!newDate) return;
    onExtendDeadline?.(task.id, newDate);
    setExtendOpen(false);
  }

  const deliveryButtons: Array<{ key: DeliveryAction; label: string; icon: typeof ImagePlus }> = [
    { key: 'SCREENSHOT', label: 'Screenshot', icon: ImagePlus },
    { key: 'DOCUMENT', label: 'Document', icon: FileText },
    { key: 'PULL_REQUEST', label: 'Raise PR', icon: GitPullRequest },
  ];

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start sm:items-center gap-2 sm:gap-4">
          {/* Status dot / select */}
          <div onClick={(e) => e.stopPropagation()} className="shrink-0 mt-0.5 sm:mt-0">
            <Select value={task.status} onValueChange={(v) => onStatusChange(task, v)}>
              <SelectTrigger className="w-[110px] sm:w-[130px] h-7 text-xs border-0 p-0 focus:ring-0 shadow-none">
                <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', statusColor(task.status))}>
                  <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', {
                    'bg-gray-400': task.status === 'TODO',
                    'bg-blue-500': task.status === 'IN_PROGRESS',
                    'bg-red-500': task.status === 'BLOCKED',
                    'bg-amber-500': task.status === 'IN_REVIEW',
                    'bg-green-500': task.status === 'DONE',
                    'bg-gray-300': task.status === 'CANCELLED',
                  })} />
                  <span className="truncate">{STATUS_LABELS[task.status] ?? task.status}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
            <p className={cn('font-medium truncate text-sm sm:text-base', task.status === 'DONE' && 'line-through text-muted-foreground')}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.department && <span className="text-xs text-muted-foreground">{task.department.name}</span>}
              {task.blockerType && (
                <span className="text-xs text-red-500 font-medium">
                  ⚠ {task.blockerType.toLowerCase().replace(/_/g, ' ')}
                </span>
              )}
              {/* Mobile: due badge */}
              {task.dueDate && <DueBadge dueDate={task.dueDate} status={task.status} className="sm:hidden" />}
            </div>
            <div className="flex items-center gap-1 flex-wrap mt-2">
              {deliveryButtons.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeliveryClick(key);
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <Badge className={cn('text-xs border shrink-0 hidden sm:flex', priorityColor(task.priority))}>{task.priority}</Badge>

          {/* Due date (desktop) + extend */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {task.dueDate && <DueBadge dueDate={task.dueDate} status={task.status} />}
            {canExtend && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
              extendOpen ? (
                <form
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                  onSubmit={submitExtend}
                >
                  <input
                    autoFocus
                    type="date"
                    min={minDateStr}
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="rounded border bg-background px-2 py-0.5 text-xs"
                  />
                  <button type="submit" className="text-green-600 hover:text-green-700">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setExtendOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExtendOpen(true); }}
                  title="Extend deadline"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>

          {/* Comments count */}
          {!!task._count?.comments && (
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">💬 {task._count.comments}</span>
          )}
          {!!task._count?.attachments && (
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">📎 {task._count.attachments}</span>
          )}

          {/* Assignee */}
          {task.assignee && (
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={task.assignee.avatarUrl} />
              <AvatarFallback className="text-xs bg-primary/10">{getInitials(task.assignee.name)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Kanban view ──────────────────────────────────────────────────────────────

function KanbanView({
  tasks, onStatusChange, onTaskClick, onDeliveryClick, canExtend, onExtendDeadline,
}: {
  tasks: Task[];
  onStatusChange: (task: Task, status: string) => void;
  onTaskClick: (id: string, delivery?: DeliveryAction) => void;
  onDeliveryClick: (id: string, delivery: DeliveryAction) => void;
  canExtend?: boolean;
  onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  const columns = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col);
        return (
          <div key={col} className={cn('flex-shrink-0 w-72 rounded-xl border-t-2 bg-muted/30', STATUS_COLORS[col])}>
            <div className="p-3 border-b">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{STATUS_LABELS[col]}</span>
                <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
              </div>
            </div>
            <div className="p-2 space-y-2 min-h-32">
              {colTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onStatusChange={onStatusChange}
                  onClick={() => onTaskClick(task.id)}
                  onDeliveryClick={(delivery) => onDeliveryClick(task.id, delivery)}
                  canExtend={canExtend}
                  onExtendDeadline={onExtendDeadline}
                />
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ task, onStatusChange, onClick, onDeliveryClick, canExtend, onExtendDeadline }: {
  task: Task;
  onStatusChange: (task: Task, status: string) => void;
  onClick: () => void;
  onDeliveryClick: (delivery: DeliveryAction) => void;
  canExtend?: boolean;
  onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [newDate, setNewDate] = useState(task.dueDate ? task.dueDate.split('T')[0] : '');
  const minDate = new Date(); minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];
  function submitExtend(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!newDate) return;
    onExtendDeadline?.(task.id, newDate);
    setExtendOpen(false);
  }
  const nextStatus: Record<string, string> = {
    TODO: 'IN_PROGRESS', IN_PROGRESS: 'DONE', BLOCKED: 'IN_PROGRESS', IN_REVIEW: 'DONE', DONE: 'TODO',
  };
  const deliveryButtons: Array<{ key: DeliveryAction; label: string; icon: typeof ImagePlus }> = [
    { key: 'SCREENSHOT', label: 'Screenshot', icon: ImagePlus },
    { key: 'DOCUMENT', label: 'Document', icon: FileText },
    { key: 'PULL_REQUEST', label: 'PR', icon: GitPullRequest },
  ];

  return (
    <div
      className="bg-background rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-shadow space-y-2"
      onClick={onClick}
    >
      <p className={cn('text-sm font-medium leading-snug', task.status === 'DONE' && 'line-through text-muted-foreground')}>
        {task.title}
      </p>
      {task.blockerType && (
        <p className="text-xs text-red-500">⚠ {task.blockerType.toLowerCase().replace(/_/g, ' ')}</p>
      )}
      <div className="flex items-center justify-between">
        <Badge className={cn('text-xs border', priorityColor(task.priority))}>{task.priority}</Badge>
        <div className="flex items-center gap-2">
          {!!task._count?.attachments && (
            <span className="text-[11px] text-muted-foreground">📎 {task._count.attachments}</span>
          )}
          <div className="flex items-center gap-1">
            {task.dueDate && <DueBadge dueDate={task.dueDate} status={task.status} />}
            {canExtend && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
              extendOpen ? (
                <form className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} onSubmit={submitExtend}>
                  <input
                    autoFocus type="date" min={minDateStr} value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="rounded border bg-background px-1.5 py-0.5 text-xs w-28"
                  />
                  <button type="submit" className="text-green-600 hover:text-green-700"><Check className="h-3 w-3" /></button>
                  <button type="button" onClick={() => setExtendOpen(false)} className="text-muted-foreground"><XIcon className="h-3 w-3" /></button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExtendOpen(true); }}
                  title="Extend deadline"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>
          {task.assignee && (
            <Avatar className="h-6 w-6">
              <AvatarImage src={task.assignee.avatarUrl} />
              <AvatarFallback className="text-xs bg-primary/10">{getInitials(task.assignee.name)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {deliveryButtons.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onDeliveryClick(key);
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {nextStatus[task.status] && (
        <button
          onClick={(e) => { e.stopPropagation(); onStatusChange(task, nextStatus[task.status]); }}
          className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed rounded px-2 py-1 transition-colors"
        >
          → Move to {STATUS_LABELS[nextStatus[task.status]]}
        </button>
      )}
    </div>
  );
}

// ── CSV Import Dialog ─────────────────────────────────────────────────────────

function CsvImportDialog({ open, onClose, onImported }: {
  open: boolean; onClose: () => void; onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);

  const parseCsv = (text: string): Record<string, string>[] => {
    const [headerLine, ...rows] = text.trim().split('\n');
    const headers = headerLine.split(',').map((h) => h.trim().replace(/"/g, ''));
    return rows
      .filter((r) => r.trim())
      .map((row) => {
        const vals = row.split(',').map((v) => v.trim().replace(/"/g, ''));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
      });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split('\n').slice(0, 4);
      setPreview(lines.map((l) => l.split(',').map((c) => c.trim().replace(/"/g, ''))));
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const rows = parseCsv(text);
    try {
      const res = await api.post('/tasks/import-csv', { rows });
      setResult(res.data);
      if (res.data.created > 0) onImported();
    } catch (err: unknown) {
      setResult({ created: 0, errors: ['Import failed. Check CSV format.'] });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setPreview([]);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import Tasks from CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Required CSV columns:</p>
            <p><code>title</code>, <code>assigneeUserId</code></p>
            <p className="text-muted-foreground">Optional: <code>description</code>, <code>priority</code> (LOW/MEDIUM/HIGH/CRITICAL), <code>departmentId</code>, <code>dueDate</code></p>
          </div>

          <div className="space-y-1.5">
            <Label>Select CSV file</Label>
            <Input ref={fileRef} type="file" accept=".csv" onChange={handleFile} />
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto rounded border">
              <table className="text-xs w-full">
                <thead className="bg-muted">
                  <tr>{preview[0].map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.slice(1).map((row, ri) => (
                    <tr key={ri} className="border-t">
                      {row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground px-2 py-1.5">Preview (first 3 rows)</p>
            </div>
          )}

          {result && (
            <div className={cn('rounded-md p-3 text-sm', result.errors.length === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
              <p className="font-medium">✓ Created {result.created} tasks</p>
              {result.errors.length > 0 && (
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => <li key={i} className="text-xs">{e}</li>)}
                  {result.errors.length > 5 && <li className="text-xs">...and {result.errors.length - 5} more errors</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <Button
            onClick={handleImport}
            disabled={importing || !fileRef.current?.files?.length}
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
