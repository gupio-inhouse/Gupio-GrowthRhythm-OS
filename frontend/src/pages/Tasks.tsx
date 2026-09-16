import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, CheckSquare, AlertTriangle, Clock, Search, LayoutGrid, List,
  Upload, ImagePlus, FileText, GitPullRequest, CalendarDays, Check,
  X as XIcon, ChevronLeft, ChevronRight, CheckCircle2, Filter,
  ArrowUpRight, Zap, Download, Bug as BugIcon, Lightbulb,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, priorityColor, formatDate, getInitials, isEngineeringDept, workingDurationLabel, countWorkingDays } from '@/lib/utils';
import { WeekdayDatePicker } from '@/components/ui/weekday-date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { BlockerDialog } from '@/components/tasks/BlockerDialog';
import { NewTaskDialog } from '@/components/tasks/NewTaskDialog';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { BugDetailDrawer } from '@/components/bugs/BugDetailDrawer';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────────────
type Task = {
  id: string; title: string; status: string; priority: string;
  startDate?: string; dueDate?: string; createdAt?: string;
  completionSubmittedAt?: string; completedAt?: string;
  assignee?: { id: string; name: string; avatarUrl?: string };
  department?: { id: string; name: string };
  team?: { id: string; name: string };
  blockerType?: string;
  _count?: { comments: number; attachments: number };
  // Present only for bugs/improvements merged into this view (see bugTasks below) —
  // `id` for these is a synthetic "bug-<bugId>" string, never sent to /tasks.
  isBug?: boolean; bugId?: string; bugType?: string; bugStatus?: string; reportedByName?: string;
};
type BugSummary = {
  id: string; type: string; title: string; status: string; severity: string; createdAt: string;
  reporter: { id: string; name: string };
  assignee?: { id: string; name: string; avatarUrl?: string } | null;
  team?: { id: string; name: string };
  department?: { id: string; name: string };
  _count?: { comments: number; attachments: number };
};
type DeliveryAction = 'SCREENSHOT' | 'DOCUMENT' | 'PULL_REQUEST';

// A bug assigned to someone shows up in that person's Tasks view too (merged,
// not a real Task row) — this is the mapping used only for grouping/filtering
// bugs into the existing TODO/IN_PROGRESS/IN_REVIEW/DONE/CANCELLED columns.
// The bug's own status (task.bugStatus) is still what's shown/edited on the card.
const BUG_STATUSES = ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'REOPENED', 'FIXED', 'CLOSED', 'WONT_FIX', 'DUPLICATE'];
// A plain TEAM_MEMBER (no bugTrackerFullAccess) can only move a bug between these three —
// resolving/reopening it is reviewer-only (backend already enforces this).
const BUG_TEAM_MEMBER_STATUSES = ['OPEN', 'IN_PROGRESS', 'IN_REVIEW'];
const BUG_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review', REOPENED: 'Reopened',
  FIXED: 'Fixed', CLOSED: 'Closed', WONT_FIX: "Won't Fix", DUPLICATE: 'Duplicate',
};
const BUG_S: Record<string, { dot: string; badge: string; bar: string; accent: string }> = {
  OPEN:        { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',    bar: '#94a3b8', accent: '#94a3b8' },
  IN_PROGRESS: { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',       bar: '#3b82f6', accent: '#3b82f6' },
  IN_REVIEW:   { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',    bar: '#f59e0b', accent: '#f59e0b' },
  REOPENED:    { dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200', bar: '#f97316', accent: '#f97316' },
  FIXED:       { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: '#10b981', accent: '#10b981' },
  CLOSED:      { dot: 'bg-gray-400',    badge: 'bg-gray-50 text-gray-600 border-gray-200',       bar: '#9ca3af', accent: '#9ca3af' },
  WONT_FIX:    { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',       bar: '#d1d5db', accent: '#d1d5db' },
  DUPLICATE:   { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',       bar: '#d1d5db', accent: '#d1d5db' },
};
const BUG_NEXT_STATUS: Record<string, string> = {
  OPEN: 'IN_PROGRESS', IN_PROGRESS: 'FIXED', IN_REVIEW: 'FIXED', REOPENED: 'IN_PROGRESS', FIXED: 'CLOSED',
};
// A plain TEAM_MEMBER can never quick-move into a resolved status — she can only push
// as far as IN_REVIEW, then it's the reviewer's move.
const BUG_NEXT_STATUS_TEAM_MEMBER: Record<string, string> = {
  OPEN: 'IN_PROGRESS', IN_PROGRESS: 'IN_REVIEW', REOPENED: 'IN_PROGRESS',
};
function bugColumn(bugStatus?: string): string {
  switch (bugStatus) {
    case 'IN_PROGRESS':
    case 'REOPENED': return 'IN_PROGRESS';
    case 'IN_REVIEW': return 'IN_REVIEW';
    case 'FIXED':
    case 'CLOSED': return 'DONE';
    case 'WONT_FIX':
    case 'DUPLICATE': return 'CANCELLED';
    default: return 'TODO';
  }
}
function taskColumn(t: Task): string {
  return t.isBug ? bugColumn(t.bugStatus) : t.status;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'];
// A TEAM_MEMBER can never put her own task directly into DONE or CANCELLED — those are
// reviewer/manager-only outcomes. She submits her work by moving it to IN_REVIEW herself.
const TASK_TEAM_MEMBER_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'];
const TASK_NEXT_STATUS_TEAM_MEMBER: Record<string, string> = {
  TODO: 'IN_PROGRESS', IN_PROGRESS: 'IN_REVIEW', BLOCKED: 'IN_PROGRESS',
};
const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked',
  IN_REVIEW: 'In Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

// Status → design tokens
const S = {
  TODO:        { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',   bar: '#94a3b8', accent: '#94a3b8' },
  IN_PROGRESS: { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',      bar: '#3b82f6', accent: '#3b82f6' },
  BLOCKED:     { dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',         bar: '#ef4444', accent: '#ef4444' },
  IN_REVIEW:   { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',   bar: '#f59e0b', accent: '#f59e0b' },
  DONE:        { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: '#10b981', accent: '#10b981' },
  CANCELLED:   { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',      bar: '#d1d5db', accent: '#d1d5db' },
} as Record<string, { dot: string; badge: string; bar: string; accent: string }>;

const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH:     'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  LOW:      'bg-gray-50 text-gray-500 border-gray-200',
};

// ── DueBadge ──────────────────────────────────────────────────────────────────
function DueBadge({
  dueDate, status, isEng = false,
  completionSubmittedAt, completedAt,
  className,
}: {
  dueDate: string; status: string; isEng?: boolean;
  completionSubmittedAt?: string; completedAt?: string;
  className?: string;
}) {
  const now    = new Date();
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const due    = new Date(dueDate);
  const dueDay = new Date(dueDate); dueDay.setHours(0, 0, 0, 0);

  if (status === 'CANCELLED') {
    return <span className={cn('text-xs text-muted-foreground tabular-nums', className)}>{formatDate(dueDate)}</span>;
  }

  if (status === 'DONE') {
    // Use submission time if available, fall back to completedAt
    const submittedStr = completionSubmittedAt || completedAt;
    if (!submittedStr) return <span className={cn('text-xs text-muted-foreground tabular-nums', className)}>{formatDate(dueDate)}</span>;

    const submitted    = new Date(submittedStr);
    const submittedDay = new Date(submittedStr); submittedDay.setHours(0, 0, 0, 0);

    if (submitted > due) {
      // How many working days late was it submitted?
      const lateDays = countWorkingDays(dueDay, submittedDay, isEng);
      return (
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200', className)}>
          <span>Done</span>
          <span className="opacity-60">·</span>
          <span>{lateDays === 0 ? 'same day' : lateDays === 1 ? '1wd late' : `${lateDays}wd late`}</span>
        </span>
      );
    }
    return (
      <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200', className)}>
        ✓ On time
      </span>
    );
  }

  // Active task — use working-day count
  const wDiff = countWorkingDays(today, dueDay, isEng); // negative = overdue

  if (due < now) {
    const days = Math.abs(wDiff);
    return (
      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200', className)}>
        {days === 0 ? 'Overdue' : days === 1 ? '1wd late' : `${days}wd late`}
      </span>
    );
  }
  if (wDiff === 0) return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200', className)}>Today</span>;
  if (wDiff === 1) return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200', className)}>Tomorrow</span>;
  if (wDiff <= 3)  return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100', className)}>In {wDiff}wd</span>;
  return <span className={cn('text-xs text-muted-foreground tabular-nums', className)}>{formatDate(dueDate)}</span>;
}

// ── DurationBadge ─────────────────────────────────────────────────────────────
function DurationBadge({ startDate, createdAt, dueDate, isEng = false }: { startDate?: string; createdAt?: string; dueDate?: string; isEng?: boolean }) {
  const start = startDate || createdAt;
  if (!start || !dueDate) return null;
  const label = workingDurationLabel(new Date(start), new Date(dueDate), isEng);
  if (!label) return null;
  return (
    <span
      title={`Working duration: ${startDate ? 'start' : 'created'} → due (${isEng ? 'Mon–Fri' : 'Mon–Sat'})`}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200 tabular-nums"
    >
      <Clock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Tasks() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const deliveryAction = (searchParams.get('delivery') as DeliveryAction | null) ?? null;
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => searchParams.get('taskId'));
  const [selectedBugId, setSelectedBugId] = useState<string | null>(() => searchParams.get('bugId'));
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [blockerCtx, setBlockerCtx] = useState<{ taskId: string; taskTitle: string } | null>(null);

  const canCreateTasks = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER'].includes(user?.role || '');
  const canExtend      = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canSearchByUser  = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canFilterByDept  = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');

  const { data: taskItems = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
  });

  // Bugs assigned to ME show up here too (merged, not a real Task row) — this is
  // the direct fix for "assigned bugs aren't visible in my tasks." Must filter to
  // MY assignment specifically (not just "has any assignee") — GET /bugs can return
  // a much broader set than "my bugs" for anyone with wider visibility (bugTrackerFullAccess,
  // MANAGER, DEPARTMENT_HEAD, OWNER), and those bugs belong only in the Bug Tracker,
  // not merged into this viewer's personal Tasks list just because they're visible to them.
  const { data: bugItems = [], isLoading: bugsLoading } = useQuery<BugSummary[]>({
    queryKey: ['bugs'],
    queryFn: () => api.get('/bugs').then((r) => r.data),
  });
  const bugTasks: Task[] = bugItems
    .filter((b) => !!b.assignee && b.assignee.id === user?.id)
    .map((b) => ({
      id: `bug-${b.id}`,
      title: b.title,
      status: b.status,
      priority: b.severity,
      createdAt: b.createdAt,
      assignee: b.assignee ?? undefined,
      department: b.department,
      team: b.team,
      _count: b._count,
      isBug: true,
      bugId: b.id,
      bugType: b.type,
      bugStatus: b.status,
      reportedByName: b.reporter.name,
    }));
  const tasks = [...taskItems, ...bugTasks];
  const isLoading = tasksLoading || bugsLoading;

  const { data: departments = [] } = useQuery<{ id: string; name: string; head?: { id: string; name: string } | null }[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: canFilterByDept,
  });

  const { data: allUsers = [] } = useQuery<{ id: string; name: string; departmentId?: string }[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: canFilterByDept,
  });

  const { data: teams = [] } = useQuery<{ id: string; name: string; department?: { id: string; name: string } }[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
    enabled: canFilterByDept,
  });

  const STATUS_TOAST: Record<string, string> = {
    IN_PROGRESS: 'Task moved to In Progress',
    IN_REVIEW:   'Submitted for review',
    DONE:        'Task marked as Done',
    BLOCKED:     'Task blocked',
    CANCELLED:   'Task cancelled',
    TODO:        'Task moved back to To Do',
  };
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/tasks/${id}`, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      const newStatus = variables.patch.status as string | undefined;
      if (newStatus) toast.success(STATUS_TOAST[newStatus] ?? 'Status updated');
    },
    onError: (e: unknown) => {
      const msg = (() => {
        if (typeof e === 'object' && e !== null && 'response' in e) {
          const r = (e as Record<string, unknown>).response;
          if (typeof r === 'object' && r !== null && 'data' in r) {
            const d = (r as Record<string, unknown>).data;
            if (typeof d === 'object' && d !== null && 'error' in d && typeof (d as Record<string, unknown>).error === 'string')
              return (d as Record<string, string>).error;
          }
        }
        return e instanceof Error ? e.message : 'Something went wrong.';
      })();
      toast.error(msg);
    },
  });

  const updateBugMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/bugs/${id}`, patch),
    onSuccess: (res, { patch }) => {
      qc.invalidateQueries({ queryKey: ['bugs'] });
      // A plain TEAM_MEMBER's "Fixed" request gets silently rerouted to "In Review"
      // server-side (needs reviewer approval) — surface that so it isn't confusing.
      const actualStatus = res.data?.status as string | undefined;
      const requestedStatus = patch.status as string | undefined;
      if (actualStatus && requestedStatus && actualStatus !== requestedStatus) {
        toast.success('Submitted for review — waiting for approval before it can be resolved.');
      } else {
        toast.success('Bug status updated');
      }
    },
    onError: (e: unknown) => {
      const msg = (() => {
        if (typeof e === 'object' && e !== null && 'response' in e) {
          const r = (e as Record<string, unknown>).response;
          if (typeof r === 'object' && r !== null && 'data' in r) {
            const d = (r as Record<string, unknown>).data;
            if (typeof d === 'object' && d !== null && 'error' in d && typeof (d as Record<string, unknown>).error === 'string')
              return (d as Record<string, string>).error;
          }
        }
        return e instanceof Error ? e.message : 'Something went wrong.';
      })();
      toast.error(msg);
    },
  });

  const handleStatusChange = (task: Task, newStatus: string) => {
    if (task.isBug && task.bugId) {
      updateBugMutation.mutate({ id: task.bugId, patch: { status: newStatus } });
      return;
    }
    if (newStatus === 'BLOCKED') {
      setBlockerCtx({ taskId: task.id, taskTitle: task.title });
      return;
    }
    // A TEAM_MEMBER submits her own work by moving it into IN_REVIEW directly now
    // (DONE isn't offered to her at all) — same guided delivery-proof flow as before.
    if ((newStatus === 'DONE' || newStatus === 'IN_REVIEW') && task.status !== 'IN_REVIEW') {
      const myId = user?.id;
      const assigneeId = task.assignee?.id;
      const isOwnTask = !!myId && !!assigneeId && myId === assigneeId;
      if (isOwnTask) {
        // Always open drawer for own-task submissions.
        // The drawer reads live attachment data — the list cache (_count) can be stale.
        const cachedCount = task._count?.attachments ?? 0;
        if (cachedCount === 0) {
          toast.error('Delivery proof required', 'Upload a screenshot, document, or PR link before submitting.');
        }
        openTask(task.id, cachedCount === 0 ? 'SCREENSHOT' : undefined);
        return;
      }
    }
    updateMutation.mutate({ id: task.id, patch: { status: newStatus } });
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

  const openBug = (bugId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('bugId', bugId);
    next.delete('taskId');
    next.delete('delivery');
    setSearchParams(next);
    setSelectedBugId(bugId);
  };

  const closeBug = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('bugId');
    setSearchParams(next);
    setSelectedBugId(null);
  };

  // Bug rows/cards pass a "bug:<bugId>" reference here instead of a real task id
  // (see ListView/KanbanView's onClick) so this single handler can route either drawer.
  const openTask = (taskId: string, delivery?: DeliveryAction) => {
    if (taskId.startsWith('bug:')) {
      openBug(taskId.slice(4));
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('taskId', taskId);
    if (delivery) next.set('delivery', delivery);
    else next.delete('delivery');
    setSearchParams(next);
    setSelectedTaskId(taskId);
  };

  const closeTask = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('taskId');
    next.delete('delivery');
    setSearchParams(next);
    setSelectedTaskId(null);
  };

  const membersInDept = (() => {
    if (!departmentFilter) return allUsers;
    const members = allUsers.filter((u) => u.departmentId === departmentFilter);
    const head = departments.find((d) => d.id === departmentFilter)?.head;
    if (head && !members.some((u) => u.id === head.id)) {
      return [...members, head];
    }
    return members;
  })();

  const isEngineeringContext = isEngineeringDept(departments.find((d) => d.id === departmentFilter)?.name);
  const engineeringProjects = teams.filter((t) => isEngineeringDept(t.department?.name));
  // Show the Project filter when Engineering is explicitly selected, or when no
  // department filter is applied and the viewer's own department is Engineering —
  // so it shows by default for Engineering folks without an extra click.
  const showProjectFilter = isEngineeringContext || (!departmentFilter && isEngineeringDept(user?.departmentName));

  const resetPage = () => setPage(1);

  const now          = new Date();
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const endOfToday    = new Date(); endOfToday.setHours(23, 59, 59, 999);

  const isTaskOverdue    = (t: Task) => !!(t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) < now);
  const isTaskDueToday   = (t: Task) => !!(t.dueDate && !['DONE', 'CANCELLED'].includes(t.status) && new Date(t.dueDate) >= now && new Date(t.dueDate) <= endOfToday);
  const isCreatedToday   = (t: Task) => !!(t.createdAt && new Date(t.createdAt) >= todayMidnight && new Date(t.createdAt) <= endOfToday);

  const filtered = tasks
    .filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(canSearchByUser && t.assignee?.name.toLowerCase().includes(q))) return false;
      }
      if (departmentFilter && t.department?.id !== departmentFilter) return false;
      if (memberFilter && t.assignee?.id !== memberFilter) return false;
      if (projectFilter && t.team?.id !== projectFilter) return false;
      if (dateFilter) {
        if (!t.dueDate) return false;
        const start = new Date(dateFilter); start.setHours(0, 0, 0, 0);
        const end   = new Date(dateFilter); end.setHours(23, 59, 59, 999);
        const due   = new Date(t.dueDate);
        if (due < start || due > end) return false;
      }
      if (statusFilter === 'overdue')   return isTaskOverdue(t);
      if (statusFilter === 'due_today') return isCreatedToday(t);
      if (statusFilter && taskColumn(t) !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const aInactive = ['DONE', 'CANCELLED'].includes(taskColumn(a));
      const bInactive = ['DONE', 'CANCELLED'].includes(taskColumn(b));
      if (aInactive !== bInactive) return aInactive ? 1 : -1;
      const urgency = (t: Task) => isTaskOverdue(t) ? 0 : isTaskDueToday(t) ? 1 : t.dueDate ? 2 : 3;
      const uA = urgency(a), uB = urgency(b);
      if (uA !== uB) return uA - uB;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    });

  // Pre-status filtered: apply search + dept + member + project + date but NOT status, so KPI tiles reflect active filters
  const preStatusFiltered = tasks.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(canSearchByUser && t.assignee?.name.toLowerCase().includes(q))) return false;
    }
    if (departmentFilter && t.department?.id !== departmentFilter) return false;
    if (memberFilter && t.assignee?.id !== memberFilter) return false;
    if (projectFilter && t.team?.id !== projectFilter) return false;
    if (dateFilter) {
      if (!t.dueDate) return false;
      const start = new Date(dateFilter); start.setHours(0, 0, 0, 0);
      const end   = new Date(dateFilter); end.setHours(23, 59, 59, 999);
      const due   = new Date(t.dueDate);
      if (due < start || due > end) return false;
    }
    return true;
  });

  const counts = {
    TODO:        preStatusFiltered.filter((t) => taskColumn(t) === 'TODO').length,
    IN_PROGRESS: preStatusFiltered.filter((t) => taskColumn(t) === 'IN_PROGRESS').length,
    BLOCKED:     preStatusFiltered.filter((t) => taskColumn(t) === 'BLOCKED').length,
    IN_REVIEW:   preStatusFiltered.filter((t) => taskColumn(t) === 'IN_REVIEW').length,
    DONE:        preStatusFiltered.filter((t) => taskColumn(t) === 'DONE').length,
  };

  const KPI_TILES = [
    { label: 'To Do',       key: 'TODO',        icon: CheckSquare,   from: 'from-slate-500',   to: 'to-gray-600',    shadow: 'shadow-slate-200' },
    { label: 'In Progress', key: 'IN_PROGRESS',  icon: Zap,           from: 'from-blue-500',    to: 'to-indigo-600',  shadow: 'shadow-blue-200' },
    { label: 'Blocked',     key: 'BLOCKED',      icon: AlertTriangle, from: 'from-red-500',     to: 'to-rose-600',    shadow: 'shadow-red-200' },
    { label: 'In Review',   key: 'IN_REVIEW',    icon: Clock,         from: 'from-amber-500',   to: 'to-orange-600',  shadow: 'shadow-amber-200' },
    { label: 'Done',        key: 'DONE',         icon: CheckCircle2,  from: 'from-emerald-500', to: 'to-green-600',   shadow: 'shadow-green-200' },
  ];

  const activeFilters = [search, statusFilter, departmentFilter, memberFilter, projectFilter, dateFilter].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="p-4 sm:p-6 lg:p-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <CheckSquare className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Tasks</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {filtered.length} of {tasks.length} task{tasks.length !== 1 ? 's' : ''}
                {activeFilters > 0 && <span className="ml-1 text-primary font-semibold">· {activeFilters} filter{activeFilters > 1 ? 's' : ''} active</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-xl border border-border/60 bg-white overflow-hidden shadow-sm p-0.5 gap-0.5">
              {([['list', List], ['kanban', LayoutGrid]] as const).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    view === v
                      ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            {canCreateTasks && ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '') && (
              <button
                onClick={() => setCsvImportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-2 text-xs font-semibold hover:border-indigo-300 hover:shadow-sm transition-all text-foreground/80"
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Import CSV</span>
              </button>
            )}

            {canCreateTasks && (
              <button
                onClick={() => setNewTaskOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 sm:px-4 py-2 text-xs font-bold text-white hover:from-indigo-600 hover:to-violet-700 shadow-sm shadow-indigo-200 transition-all"
              >
                <Plus className="h-4 w-4" />
                {user?.role === 'TEAM_MEMBER' ? 'Add My Task' : 'New Task'}
              </button>
            )}
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="rounded-2xl border border-border/60 bg-white shadow-sm p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={canSearchByUser ? 'Search by title or person…' : 'Search tasks…'}
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="pl-9 rounded-xl border-border/60 bg-muted/20 focus-visible:bg-white h-9 text-sm"
              />
            </div>

            {canFilterByDept && (
              <>
                <Select
                  value={departmentFilter || '__all__'}
                  onValueChange={(v) => { setDepartmentFilter(v === '__all__' ? '' : v); setMemberFilter(''); setProjectFilter(''); resetPage(); }}
                >
                  <SelectTrigger className="w-full sm:w-44 h-9 text-sm rounded-xl border-border/60">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="__all__">All Departments</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select
                  value={memberFilter || '__all__'}
                  onValueChange={(v) => { setMemberFilter(v === '__all__' ? '' : v); resetPage(); }}
                  disabled={!membersInDept.length}
                >
                  <SelectTrigger className="w-full sm:w-44 h-9 text-sm rounded-xl border-border/60">
                    <SelectValue placeholder="All Members" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="__all__">All Members</SelectItem>
                    {membersInDept.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                {showProjectFilter && (
                  <Select
                    value={projectFilter || '__all__'}
                    onValueChange={(v) => { setProjectFilter(v === '__all__' ? '' : v); resetPage(); }}
                    disabled={!engineeringProjects.length}
                  >
                    <SelectTrigger className="w-full sm:w-44 h-9 text-sm rounded-xl border-border/60">
                      <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="__all__">All Projects</SelectItem>
                      {engineeringProjects.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}

            {/* Custom date filter */}
            <WeekdayDatePicker
              value={dateFilter}
              onChange={(v) => { setDateFilter(v); setStatusFilter(''); resetPage(); }}
              excludeSat={isEngineeringContext}
              placeholder="Filter by date"
            />

            {activeFilters > 0 && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setDepartmentFilter(''); setMemberFilter(''); setProjectFilter(''); setDateFilter(''); resetPage(); }}
                className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-border/60 px-3 text-xs font-semibold text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all shrink-0"
              >
                <XIcon className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Status + date quick-filter pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-nowrap">
            {[
              { val: '', label: 'All', dot: '', icon: Filter },
              { val: 'due_today',   label: 'Today',       dot: '#f59e0b', icon: null },
              { val: 'overdue',     label: 'Overdue',     dot: '#ef4444', icon: null },
              { val: 'TODO',        label: 'To Do',       dot: S.TODO.bar, icon: null },
              { val: 'IN_PROGRESS', label: 'In Progress', dot: S.IN_PROGRESS.bar, icon: null },
              { val: 'BLOCKED',     label: 'Blocked',     dot: S.BLOCKED.bar, icon: null },
              { val: 'IN_REVIEW',   label: 'In Review',   dot: S.IN_REVIEW.bar, icon: null },
              { val: 'DONE',        label: 'Done',        dot: S.DONE.bar, icon: null },
            ].map(({ val, label, dot, icon: Icon }) => {
              const active = statusFilter === val && !dateFilter;
              return (
                <button
                  key={val}
                  onClick={() => { setStatusFilter(val); setDateFilter(''); resetPage(); }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap shrink-0',
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'border-border/60 bg-white text-muted-foreground hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50/50',
                  )}
                >
                  {dot && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} />}
                  {!dot && Icon && <Icon className="h-3 w-3" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── KPI Stat tiles ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {KPI_TILES.map(({ label, key, icon: Icon, from, to, shadow }) => {
            const active = statusFilter === key;
            return (
              <button
                key={key}
                onClick={() => { setStatusFilter(active ? '' : key); resetPage(); }}
                className={cn('group text-left rounded-2xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary', active ? 'scale-[1.03]' : 'hover:scale-[1.02]')}
              >
                <Card className={cn(
                  'relative overflow-hidden rounded-2xl border-0 shadow-md transition-all duration-200 bg-gradient-to-br',
                  from, to, shadow,
                  active ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent shadow-xl' : 'group-hover:shadow-lg',
                )}>
                  <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-white/10 -translate-y-6 translate-x-6" />
                  {active && <div className="absolute inset-0 bg-white/10" />}
                  <CardContent className="relative p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-1.5 rounded-lg bg-white/20">
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      {active && <ArrowUpRight className="h-3.5 w-3.5 text-white/80" />}
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-white tabular-nums leading-none">
                      {counts[key as keyof typeof counts]}
                    </p>
                    <p className="text-[10px] sm:text-xs text-white/80 mt-1 font-semibold">{label}</p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div className="space-y-2.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-white border border-border/60 animate-pulse" />
            ))}
          </div>
        ) : view === 'list' ? (
          <ListView
            tasks={filtered} page={page} onPageChange={setPage}
            onStatusChange={handleStatusChange} onTaskClick={openTask} onDeliveryClick={openTask}
            canExtend={canExtend} onExtendDeadline={handleExtendDeadline}
          />
        ) : (
          <KanbanView
            tasks={filtered} page={page} onPageChange={setPage}
            onStatusChange={handleStatusChange} onTaskClick={openTask} onDeliveryClick={openTask}
            canExtend={canExtend} onExtendDeadline={handleExtendDeadline}
          />
        )}
      </div>

      {/* ── Dialogs ── */}
      {canCreateTasks && (
        <NewTaskDialog
          open={newTaskOpen}
          onClose={() => setNewTaskOpen(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['tasks'] })}
          taskToEdit={null}
        />
      )}

      <TaskDetailDrawer taskId={selectedTaskId} initialDeliveryAction={deliveryAction} onClose={closeTask} />
      <BugDetailDrawer bugId={selectedBugId} onClose={closeBug} />

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
          onImported={() => { qc.invalidateQueries({ queryKey: ['tasks'] }); setCsvImportOpen(false); }}
        />
      )}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────
function ListView({
  tasks, page, onPageChange, onStatusChange, onTaskClick, onDeliveryClick, canExtend, onExtendDeadline,
}: {
  tasks: Task[]; page: number; onPageChange: (p: number) => void;
  onStatusChange: (task: Task, status: string) => void;
  onTaskClick: (id: string, delivery?: DeliveryAction) => void;
  onDeliveryClick: (id: string, delivery: DeliveryAction) => void;
  canExtend?: boolean; onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 gap-4 text-muted-foreground">
        <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-center">
          <CheckSquare className="h-10 w-10 text-indigo-200" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground/60">No tasks found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      </div>
    );
  }

  const paged = paginate(tasks, page);
  return (
    <>
      <div className="space-y-2">
        {paged.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            onStatusChange={onStatusChange}
            onClick={() => onTaskClick(task.isBug ? `bug:${task.bugId}` : task.id)}
            onDeliveryClick={(d) => onDeliveryClick(task.id, d)}
            canExtend={canExtend}
            onExtendDeadline={onExtendDeadline}
          />
        ))}
      </div>
      <TaskPagination total={tasks.length} page={page} onPageChange={onPageChange} />
    </>
  );
}

function TaskListRow({
  task, onStatusChange, onClick, onDeliveryClick, canExtend, onExtendDeadline,
}: {
  task: Task; onStatusChange: (task: Task, status: string) => void;
  onClick: () => void; onDeliveryClick: (d: DeliveryAction) => void;
  canExtend?: boolean; onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [newDate, setNewDate]       = useState(task.dueDate ? task.dueDate.split('T')[0] : '');
  const minDate = new Date(); minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];
  const now = new Date();
  const isOverdue = !!(task.dueDate && !['DONE', 'CANCELLED'].includes(task.status) && new Date(task.dueDate) < now);
  const { user } = useAuthStore();
  const displayStatus = task.isBug ? (task.bugStatus ?? 'OPEN') : task.status;
  const statusTokens = task.isBug ? (BUG_S[displayStatus] ?? BUG_S.OPEN) : (S[displayStatus] ?? S.TODO);
  const isPlainTeamMemberViewer = user?.role === 'TEAM_MEMBER' && !user?.bugTrackerFullAccess;
  const isTeamMemberViewer = user?.role === 'TEAM_MEMBER';
  const statusOptionList = task.isBug
    ? (isPlainTeamMemberViewer ? Array.from(new Set([...BUG_TEAM_MEMBER_STATUSES, displayStatus])) : BUG_STATUSES)
    : (isTeamMemberViewer ? Array.from(new Set([...TASK_TEAM_MEMBER_STATUSES, task.status])) : STATUSES);
  const statusLabelMap = task.isBug ? BUG_STATUS_LABELS : STATUS_LABELS;
  const statusStyleMap = task.isBug ? BUG_S : S;
  const isFinished = ['DONE', 'CANCELLED'].includes(taskColumn(task));

  function submitExtend(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!newDate) return;
    onExtendDeadline?.(task.id, newDate);
    setExtendOpen(false);
  }

  const DELIVERY: Array<{ key: DeliveryAction; label: string; icon: typeof ImagePlus }> = [
    { key: 'SCREENSHOT', label: 'Screenshot', icon: ImagePlus },
    { key: 'DOCUMENT',   label: 'Document',   icon: FileText },
    { key: 'PULL_REQUEST', label: 'PR',       icon: GitPullRequest },
  ];

  return (
    <div className={cn(
      'group rounded-2xl border bg-white overflow-hidden transition-all duration-200',
      'hover:shadow-lg hover:border-indigo-200/60',
      isOverdue ? 'border-red-200' : 'border-border/60',
    )}>
      {/* Colored left accent bar */}
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-2xl" style={{ background: isOverdue ? '#ef4444' : statusTokens.accent }} />

        <div className="flex-1 p-3 sm:p-4">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3">

            {/* Status selector */}
            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              <Select value={displayStatus} onValueChange={(v) => onStatusChange(task, v)}>
                <SelectTrigger className="h-7 border-0 p-0 shadow-none focus:ring-0 w-auto">
                  <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border', statusTokens.badge)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusTokens.dot)} />
                    <span className="hidden sm:inline">{statusLabelMap[displayStatus] ?? displayStatus}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {statusOptionList.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusStyleMap[s]?.dot ?? 'bg-gray-300')} />
                        {statusLabelMap[s]}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title + meta */}
            <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
              <p className={cn(
                'font-semibold text-sm sm:text-[15px] leading-snug group-hover:text-indigo-700 transition-colors',
                isFinished && 'line-through text-muted-foreground',
              )}>
                {task.title}
              </p>

              {task.isBug && (
                <p className={cn('text-[11px] font-bold mt-0.5 flex items-center gap-1', task.bugType === 'ENHANCEMENT' ? 'text-violet-600' : 'text-red-600')}>
                  {task.bugType === 'ENHANCEMENT' ? <Lightbulb className="h-3 w-3" /> : <BugIcon className="h-3 w-3" />}
                  {task.bugType === 'ENHANCEMENT' ? 'Improvement suggested by' : 'Bug reported by'} {task.reportedByName}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {task.department && (
                  <span className="text-[10px] text-muted-foreground font-medium">{task.department.name}</span>
                )}
                {task.team && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
                    {task.team.name}
                  </span>
                )}
                {task.blockerType && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {task.blockerType.toLowerCase().replace(/_/g, ' ')}
                  </span>
                )}
                {/* Mobile due badge + duration */}
                {task.dueDate && <DueBadge dueDate={task.dueDate} status={task.status} isEng={isEngineeringDept(task.department?.name)} completionSubmittedAt={task.completionSubmittedAt} completedAt={task.completedAt} className="sm:hidden" />}
                <DurationBadge startDate={task.startDate} createdAt={task.createdAt} dueDate={task.dueDate} isEng={isEngineeringDept(task.department?.name)} />
              </div>

              {/* Delivery buttons */}
              {!task.isBug && (
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {DELIVERY.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeliveryClick(key); }}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50"
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Priority */}
            <Badge className={cn('text-[10px] font-bold border rounded-full px-2 shrink-0 hidden sm:flex', PRIORITY_STYLE[task.priority] ?? priorityColor(task.priority))}>
              {task.priority}
            </Badge>

            {/* Duration + due date (desktop) + extend */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <DurationBadge startDate={task.startDate} createdAt={task.createdAt} dueDate={task.dueDate} isEng={isEngineeringDept(task.department?.name)} />
              {task.dueDate && <DueBadge dueDate={task.dueDate} status={task.status} isEng={isEngineeringDept(task.department?.name)} completionSubmittedAt={task.completionSubmittedAt} completedAt={task.completedAt} />}
              {canExtend && !task.isBug && !['DONE', 'CANCELLED'].includes(task.status) && (
                extendOpen ? (
                  <form className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} onSubmit={submitExtend}>
                    <WeekdayDatePicker
                      value={newDate}
                      onChange={setNewDate}
                      excludeSat={isEngineeringDept(task.department?.name)}
                      minDate={minDateStr}
                      placeholder="New date"
                      inputClassName="text-[11px] h-8 px-2"
                    />
                    <button type="submit" className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setExtendOpen(false)} className="p-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExtendOpen(true); }}
                    title="Extend deadline"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                  </button>
                )
              )}
            </div>

            {/* Counts */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {!!task._count?.comments && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                  💬 {task._count.comments}
                </span>
              )}
              {!!task._count?.attachments && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                  📎 {task._count.attachments}
                </span>
              )}
            </div>

            {/* Assignee */}
            {task.assignee && (
              <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={onClick}>
                <Avatar className="h-7 w-7 ring-2 ring-white shadow-sm">
                  <AvatarImage src={task.assignee.avatarUrl} />
                  <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                    {getInitials(task.assignee.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground hidden lg:block max-w-[90px] truncate font-medium">
                  {task.assignee.name}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────
const KANBAN_COLS = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'];

const COL_STYLE: Record<string, { from: string; to: string; bg: string; headerBg: string }> = {
  TODO:        { from: 'from-slate-400',   to: 'to-gray-500',    bg: 'bg-slate-50/60',   headerBg: 'bg-slate-50' },
  IN_PROGRESS: { from: 'from-blue-500',    to: 'to-indigo-600',  bg: 'bg-blue-50/40',    headerBg: 'bg-blue-50' },
  BLOCKED:     { from: 'from-red-500',     to: 'to-rose-600',    bg: 'bg-red-50/40',     headerBg: 'bg-red-50' },
  IN_REVIEW:   { from: 'from-amber-500',   to: 'to-orange-600',  bg: 'bg-amber-50/40',   headerBg: 'bg-amber-50' },
  DONE:        { from: 'from-emerald-500', to: 'to-green-600',   bg: 'bg-emerald-50/40', headerBg: 'bg-emerald-50' },
};

function KanbanView({
  tasks, page, onPageChange, onStatusChange, onTaskClick, onDeliveryClick, canExtend, onExtendDeadline,
}: {
  tasks: Task[]; page: number; onPageChange: (p: number) => void;
  onStatusChange: (task: Task, status: string) => void;
  onTaskClick: (id: string, delivery?: DeliveryAction) => void;
  onDeliveryClick: (id: string, delivery: DeliveryAction) => void;
  canExtend?: boolean; onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  const paged = paginate(tasks, page);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLS.map((col) => {
          const colTasks = paged.filter((t) => taskColumn(t) === col);
          const totalInCol = tasks.filter((t) => taskColumn(t) === col).length;
          const cs = COL_STYLE[col];

          return (
            <div key={col} className={cn('flex-shrink-0 w-72 rounded-2xl border border-border/50 overflow-hidden', cs.bg)}>
              {/* Column header */}
              <div className={cn('px-4 py-3 border-b border-border/40', cs.headerBg)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('h-1.5 w-1.5 rounded-full', S[col]?.dot ?? 'bg-gray-300')} />
                    <span className="text-sm font-bold">{STATUS_LABELS[col]}</span>
                  </div>
                  <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5 border', S[col]?.badge ?? '')}>
                    {totalInCol}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-32">
                {colTasks.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    onStatusChange={onStatusChange}
                    onClick={() => onTaskClick(task.isBug ? `bug:${task.bugId}` : task.id)}
                    onDeliveryClick={(d) => onDeliveryClick(task.id, d)}
                    canExtend={canExtend}
                    onExtendDeadline={onExtendDeadline}
                  />
                ))}
                {colTasks.length === 0 && (
                  <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                    <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center bg-gradient-to-br opacity-40', cs.from, cs.to)}>
                      <CheckSquare className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-xs font-medium">No tasks</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <TaskPagination total={tasks.length} page={page} onPageChange={onPageChange} />
    </>
  );
}

function KanbanCard({
  task, onStatusChange, onClick, onDeliveryClick, canExtend, onExtendDeadline,
}: {
  task: Task; onStatusChange: (task: Task, status: string) => void;
  onClick: () => void; onDeliveryClick: (d: DeliveryAction) => void;
  canExtend?: boolean; onExtendDeadline?: (taskId: string, newDate: string) => void;
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [newDate, setNewDate]       = useState(task.dueDate ? task.dueDate.split('T')[0] : '');
  const minDate = new Date(); minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];
  const now = new Date();
  const isOverdue = !!(task.dueDate && !['DONE', 'CANCELLED'].includes(task.status) && new Date(task.dueDate) < now);
  const { user } = useAuthStore();
  const displayStatus = task.isBug ? (task.bugStatus ?? 'OPEN') : task.status;
  const statusStyleMap = task.isBug ? BUG_S : S;
  const isFinished = ['DONE', 'CANCELLED'].includes(taskColumn(task));
  const isPlainTeamMemberViewer = user?.role === 'TEAM_MEMBER' && !user?.bugTrackerFullAccess;
  const isTeamMemberViewer = user?.role === 'TEAM_MEMBER';

  const taskNextStatus: Record<string, string> = {
    TODO: 'IN_PROGRESS', IN_PROGRESS: 'DONE', BLOCKED: 'IN_PROGRESS', IN_REVIEW: 'DONE', DONE: 'TODO',
  };
  const bugNextStatusMap = isPlainTeamMemberViewer ? BUG_NEXT_STATUS_TEAM_MEMBER : BUG_NEXT_STATUS;
  const taskNextStatusMap = isTeamMemberViewer ? TASK_NEXT_STATUS_TEAM_MEMBER : taskNextStatus;
  const nextStatusValue = task.isBug ? bugNextStatusMap[displayStatus] : taskNextStatusMap[task.status];
  const nextStatusLabel = task.isBug ? BUG_STATUS_LABELS[nextStatusValue] : STATUS_LABELS[nextStatusValue];

  const DELIVERY: Array<{ key: DeliveryAction; label: string; icon: typeof ImagePlus }> = [
    { key: 'SCREENSHOT', label: 'SS', icon: ImagePlus },
    { key: 'DOCUMENT',   label: 'Doc', icon: FileText },
    { key: 'PULL_REQUEST', label: 'PR', icon: GitPullRequest },
  ];

  function submitExtend(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!newDate) return;
    onExtendDeadline?.(task.id, newDate);
    setExtendOpen(false);
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-white overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md hover:border-indigo-200/60 group',
        isOverdue ? 'border-red-200' : 'border-border/60',
      )}
      onClick={onClick}
    >
      {/* Top accent */}
      <div className="h-0.5 w-full" style={{ background: isOverdue ? '#ef4444' : (statusStyleMap[displayStatus]?.accent ?? '#94a3b8') }} />

      <div className="p-3 space-y-2.5">
        {/* Title */}
        <p className={cn(
          'text-sm font-semibold leading-snug group-hover:text-indigo-700 transition-colors',
          isFinished && 'line-through text-muted-foreground',
        )}>
          {task.title}
        </p>

        {task.isBug && (
          <p className={cn('text-[10px] font-bold flex items-center gap-1', task.bugType === 'ENHANCEMENT' ? 'text-violet-600' : 'text-red-600')}>
            {task.bugType === 'ENHANCEMENT' ? <Lightbulb className="h-2.5 w-2.5" /> : <BugIcon className="h-2.5 w-2.5" />}
            {task.bugType === 'ENHANCEMENT' ? 'Improvement suggested by' : 'Bug reported by'} {task.reportedByName}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {task.team && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
              {task.team.name}
            </span>
          )}
          {task.blockerType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-semibold">
              ⚠ {task.blockerType.toLowerCase().replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2">
          <Badge className={cn('text-[10px] border rounded-full px-1.5', PRIORITY_STYLE[task.priority] ?? priorityColor(task.priority))}>
            {task.priority}
          </Badge>

          <div className="flex items-center gap-1.5">
            {!!task._count?.attachments && (
              <span className="text-[10px] text-muted-foreground">📎{task._count.attachments}</span>
            )}
            <DurationBadge startDate={task.startDate} createdAt={task.createdAt} dueDate={task.dueDate} isEng={isEngineeringDept(task.department?.name)} />
            {task.dueDate && <DueBadge dueDate={task.dueDate} status={task.status} isEng={isEngineeringDept(task.department?.name)} completionSubmittedAt={task.completionSubmittedAt} completedAt={task.completedAt} />}
            {canExtend && !task.isBug && !['DONE', 'CANCELLED'].includes(task.status) && (
              extendOpen ? (
                <form className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()} onSubmit={submitExtend}>
                  <WeekdayDatePicker
                    value={newDate}
                    onChange={setNewDate}
                    excludeSat={isEngineeringDept(task.department?.name)}
                    minDate={minDateStr}
                    placeholder="New date"
                    inputClassName="text-[10px] h-7 px-2"
                  />
                  <button type="submit" className="text-emerald-600"><Check className="h-3 w-3" /></button>
                  <button type="button" onClick={() => setExtendOpen(false)} className="text-muted-foreground"><XIcon className="h-3 w-3" /></button>
                </form>
              ) : (
                <button type="button" onClick={(e) => { e.stopPropagation(); setExtendOpen(true); }} title="Extend" className="text-muted-foreground hover:text-indigo-600 transition-colors">
                  <CalendarDays className="h-3.5 w-3.5" />
                </button>
              )
            )}
            {task.assignee && (
              <Avatar className="h-6 w-6 ring-1 ring-white shadow-sm">
                <AvatarImage src={task.assignee.avatarUrl} />
                <AvatarFallback className="text-[9px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                  {getInitials(task.assignee.name)}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>

        {/* Delivery buttons */}
        {!task.isBug && (
          <div className="flex items-center gap-1 flex-wrap">
            {DELIVERY.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeliveryClick(key); }}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all"
              >
                <Icon className="h-2.5 w-2.5" /> {label}
              </button>
            ))}
          </div>
        )}

        {/* Quick-move button */}
        {nextStatusValue && (
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(task, nextStatusValue); }}
            className="w-full text-[10px] font-semibold text-muted-foreground hover:text-indigo-700 border border-dashed border-border/60 hover:border-indigo-300 hover:bg-indigo-50 rounded-lg px-2 py-1.5 transition-all"
          >
            → Move to {nextStatusLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

function paginate<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  return items.slice((page - 1) * size, page * size);
}

function TaskPagination({ total, page, onPageChange }: { total: number; page: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  const from = (page - 1) * PAGE_SIZE + 1;
  const to   = Math.min(page * PAGE_SIZE, total);

  const pages: (number | 'gap')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3)              pages.push('gap');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('gap');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between pt-4 border-t border-border/40 mt-4 gap-4">
      <p className="text-xs text-muted-foreground shrink-0">
        <span className="font-semibold">{from}–{to}</span> of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1} onClick={() => onPageChange(page - 1)}
          className="h-8 w-8 rounded-xl border border-border/60 bg-white flex items-center justify-center text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={cn(
                'h-8 min-w-[32px] px-2.5 rounded-xl border text-xs font-semibold transition-all shadow-sm',
                page === p
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white border-transparent shadow-indigo-200'
                  : 'bg-white border-border/60 text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50',
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          disabled={page === totalPages} onClick={() => onPageChange(page + 1)}
          className="h-8 w-8 rounded-xl border border-border/60 bg-white flex items-center justify-center text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── CSV Import Dialog ─────────────────────────────────────────────────────────
function CsvImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult]   = useState<{ created: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);

  const KNOWN_COLS: { key: string; aliases: string[]; label: string }[] = [
    { key: 'title',           aliases: ['title'],                           label: 'title' },
    { key: 'assigneeEmail',   aliases: ['assigneeEmail', 'email'],          label: 'assigneeEmail' },
    { key: 'description',     aliases: ['description'],                     label: 'description' },
    { key: 'expectedOutcome', aliases: ['expectedOutcome'],                 label: 'expectedOutcome' },
    { key: 'departmentName',  aliases: ['departmentName', 'department'],    label: 'department' },
    { key: 'projectName',     aliases: ['projectName', 'project'],          label: 'project' },
    { key: 'priority',        aliases: ['priority'],                        label: 'priority' },
    { key: 'startDate',       aliases: ['startDate'],                       label: 'startDate' },
    { key: 'dueDate',         aliases: ['dueDate'],                         label: 'dueDate' },
    { key: 'recurrence',      aliases: ['recurrence'],                      label: 'recurrence' },
  ];

  const normalizeHeader = (h: string): string => {
    const lower = h.toLowerCase().trim().replace(/"/g, '');
    return KNOWN_COLS.find((c) => c.aliases.some((a) => a.toLowerCase() === lower))?.key ?? h;
  };

  const parseCsv = (text: string): Record<string, string>[] => {
    const [headerLine, ...rows] = text.trim().split('\n');
    const headers = headerLine.split(',').map(normalizeHeader);
    return rows.filter((r) => r.trim()).map((row) => {
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
      const rawHeaders = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
      // Only show known columns in preview — filter out unknown/extra columns
      const knownIndexes = rawHeaders
        .map((h, i) => ({ i, key: KNOWN_COLS.find((c) => c.aliases.some((a) => a.toLowerCase() === h.toLowerCase()))?.label }))
        .filter((x) => x.key !== undefined);
      const previewRows = lines.map((line) => {
        const cells = line.split(',').map((c) => c.trim().replace(/"/g, ''));
        return knownIndexes.map((x) => cells[x.i] ?? '');
      });
      previewRows[0] = knownIndexes.map((x) => x.key!);
      setPreview(previewRows);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    try {
      const res = await api.post('/tasks/import-csv', { rows: parseCsv(text) });
      setResult(res.data);
      if (res.data.created > 0) onImported();
    } catch {
      setResult({ created: 0, errors: ['Import failed. Check CSV format.'] });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setResult(null); setPreview([]);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Upload className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            Import Tasks from CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl bg-indigo-50/60 border border-indigo-100 p-4 text-xs flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="font-semibold text-indigo-900">Download the template, fill it in, then upload.</p>
              <p className="text-indigo-700">Required: <span className="font-mono">title, assigneeEmail</span></p>
              <div className="text-muted-foreground space-y-0.5">
                <p>Optional fields:</p>
                <p className="font-mono pl-1">description, expectedOutcome</p>
                <p className="font-mono pl-1">departmentName, projectName <span className="font-sans">(exact names)</span></p>
                <p className="font-mono pl-1">priority <span className="font-sans">(LOW/MEDIUM/HIGH/CRITICAL)</span></p>
                <p className="font-mono pl-1">startDate <span className="font-sans">(YYYY-MM-DD, defaults to today)</span></p>
                <p className="font-mono pl-1">dueDate <span className="font-sans">(YYYY-MM-DD)</span></p>
                <p className="font-mono pl-1">recurrence <span className="font-sans">(NONE/DAILY/WEEKLY/MONTHLY/YEARLY)</span></p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const csv = [
                  'title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence',
                  'Design homepage mockup,john@company.com,Create wireframes for homepage,Approved mockup ready for dev,Marketing,,HIGH,2025-07-28,2025-08-01,NONE',
                  'Write API documentation,sarah@company.com,Document all REST endpoints,,Engineering,Backend API,MEDIUM,2025-08-10,2025-08-15,NONE',
                  'Weekly status report,dev@company.com,Compile team progress,,,,LOW,,2025-08-07,WEEKLY',
                ].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'tasks-import-template.csv';
                a.click(); URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-1.5 shrink-0 rounded-xl border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" /> Template
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Select CSV file</Label>
            <Input
              ref={fileRef} type="file" accept=".csv" onChange={handleFile}
              className="rounded-xl border-border/60 text-sm file:mr-3 file:text-xs file:font-semibold file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-muted/50">
                    {preview[0].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-semibold text-foreground/70">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(1).map((row, ri) => (
                    <tr key={ri} className="border-t border-border/40">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px]">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground px-3 py-2 border-t border-border/40">Preview — first 3 rows</p>
            </div>
          )}

          {result && (
            <div className={cn(
              'rounded-2xl p-4 text-sm font-medium',
              result.errors.length === 0
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border border-amber-200 text-amber-800',
            )}>
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Created {result.created} tasks
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-0.5 text-xs font-normal">
                  {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  {result.errors.length > 5 && <li>…and {result.errors.length - 5} more errors</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={handleClose}>Close</Button>
          <Button
            onClick={handleImport}
            disabled={importing || !fileRef.current?.files?.length}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 border-0"
          >
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
