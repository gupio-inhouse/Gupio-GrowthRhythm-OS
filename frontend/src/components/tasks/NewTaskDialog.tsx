import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, getInitials } from '@/lib/utils';
import {
  ClipboardList, User, Calendar, Clock, Tag, Link2, FolderKanban,
  ChevronDown, Search, X,
} from 'lucide-react';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';

// ── Schemas ───────────────────────────────────────────────────────────────────

const elevatedSchema = z.object({
  title:           z.string().min(2, 'Title is required'),
  description:     z.string().optional(),
  expectedOutcome: z.string().optional(),
  assigneeUserId:  z.string().optional(),
  departmentId:    z.string().optional(),
  teamId:          z.string().optional(),
  dependencyId:    z.string().optional(),
  priority:        z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate:         z.string().optional(),
  dueTime:         z.string().optional(),
});

const memberSchema = z.object({
  title:           z.string().min(2, 'Title is required'),
  description:     z.string().optional(),
  expectedOutcome: z.string().optional(),
  assigneeUserId:  z.string().optional(),
  departmentId:    z.string().optional(),
  teamId:          z.string().optional(),
  dependencyId:    z.string().optional(),
  priority:        z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate:         z.string().optional(),
  dueTime:         z.string().optional(),
});

type FormData = z.infer<typeof elevatedSchema>;

type UserItem      = { id: string; name: string; role: string; departmentId?: string };
type Department    = { id: string; name: string };
type TaskItem      = { id: string; title: string };
type TeamItem      = { id: string; name: string; members: { user: { id: string } }[] };

export type TaskToEdit = {
  id: string;
  title: string;
  description?: string;
  expectedOutcome?: string;
  priority: string;
  dueDate?: string;
  assignee?: { id: string; name: string } | null;
  department?: { id: string; name: string };
};

interface Props {
  open:        boolean;
  onClose:     () => void;
  onCreated:   () => void;
  taskToEdit?: TaskToEdit | null;
}

const PRIORITY_CONFIG = {
  LOW:      { label: 'Low',      color: 'bg-slate-100 text-slate-700 border-slate-200'    },
  MEDIUM:   { label: 'Medium',   color: 'bg-blue-100 text-blue-700 border-blue-200'       },
  HIGH:     { label: 'High',     color: 'bg-amber-100 text-amber-700 border-amber-200'    },
  CRITICAL: { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200'          },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function NewTaskDialog({ open, onClose, onCreated, taskToEdit }: Props) {
  const { user } = useAuthStore();
  const isTeamMember    = user?.role === 'TEAM_MEMBER';
  const canAssignToAny  = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const isEditMode      = !!taskToEdit;
  const activeSchema    = isTeamMember ? memberSchema : elevatedSchema;

  const [userSearch, setUserSearch] = useState('');
  const [userDropOpen, setUserDropOpen] = useState(false);

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ['users-list'],
    queryFn:  () => api.get('/users').then((r) => r.data),
    enabled:  open && canAssignToAny,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn:  () => api.get('/departments').then((r) => r.data),
    enabled:  open && canAssignToAny,
  });

  const { data: allTasks = [] } = useQuery<TaskItem[]>({
    queryKey: ['tasks-list'],
    queryFn:  () => api.get('/tasks').then((r) => r.data),
    enabled:  open && canAssignToAny,
  });

  const { data: teams = [] } = useQuery<TeamItem[]>({
    queryKey: ['teams'],
    queryFn:  () => api.get('/teams').then((r) => r.data),
    enabled:  open,
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(activeSchema as z.ZodType<FormData>),
    defaultValues: { priority: 'MEDIUM' },
  });

  const watchedPriority    = (watch('priority') || 'MEDIUM') as keyof typeof PRIORITY_CONFIG;
  const watchedAssigneeId  = watch('assigneeUserId') || '';
  const watchedDependencyId= watch('dependencyId')   || '';
  const watchedTeamId      = watch('teamId')          || '';
  const watchedDeptId      = watch('departmentId')    || '';

  useEffect(() => {
    if (!open) return;
    setUserSearch('');
    setUserDropOpen(false);
    if (taskToEdit) {
      reset({
        title:           taskToEdit.title,
        description:     taskToEdit.description ?? '',
        expectedOutcome: taskToEdit.expectedOutcome ?? '',
        priority:        taskToEdit.priority as FormData['priority'],
        assigneeUserId:  taskToEdit.assignee?.id ?? '',
        departmentId:    taskToEdit.department?.id ?? '',
        dueDate:         taskToEdit.dueDate ? new Date(taskToEdit.dueDate).toISOString().split('T')[0] : '',
        dueTime: (() => {
          if (!taskToEdit.dueDate) return '';
          const d = new Date(taskToEdit.dueDate);
          const h = d.getHours(), m = d.getMinutes();
          if (h === 23 && m === 59) return '';
          return (h !== 0 || m !== 0) ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '';
        })(),
      });
    } else {
      reset({ priority: 'MEDIUM' });
      if (isTeamMember && user) {
        setValue('assigneeUserId', user.id);
        if (user.departmentId) setValue('departmentId', user.departmentId);
      }
    }
  }, [open, taskToEdit]);

  const handleClose = () => { reset(); setUserSearch(''); setUserDropOpen(false); onClose(); };

  const onSubmit = async (data: FormData) => {
    const dueDate = data.dueDate;
    const dueTime = data.dueTime;
    let dueDateIso: string | undefined;
    if (dueDate) {
      dueDateIso = new Date(`${dueDate}T${dueTime || '23:59:59'}`).toISOString();
    }

    const payload: Record<string, unknown> = isTeamMember && isEditMode
      ? { title: data.title, description: data.description || undefined }
      : {
          title:           data.title,
          description:     data.description      || undefined,
          expectedOutcome: data.expectedOutcome  || undefined,
          assigneeUserId:  isTeamMember ? user!.id : (data.assigneeUserId || undefined),
          departmentId:    data.departmentId     || undefined,
          teamId:          data.teamId           || undefined,
          dependencyId:    data.dependencyId     || undefined,
          priority:        data.priority,
          dueDate:         dueDateIso,
        };

    if (isEditMode && taskToEdit) {
      await api.patch(`/tasks/${taskToEdit.id}`, payload);
    } else {
      await api.post('/tasks', payload);
    }
    reset();
    onCreated();
    onClose();
  };

  // Filtered user list for assignee search
  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    return u.name.toLowerCase().includes(userSearch.toLowerCase());
  });

  // Group by department for the dropdown
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const assigneeName = users.find((u) => u.id === watchedAssigneeId)?.name;

  const availableTeams = canAssignToAny && watchedAssigneeId
    ? teams.filter((t) => t.members.some((m) => m.user.id === watchedAssigneeId))
    : teams;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl p-0 gap-0 overflow-hidden rounded-2xl">

        {/* ── Gradient header ── */}
        <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-white font-bold text-base leading-tight">
                {isEditMode ? 'Edit Task' : isTeamMember ? 'Add My Task' : 'Create New Task'}
              </DialogTitle>
              <p className="text-white/70 text-xs mt-0.5">
                {isEditMode ? 'Update task details' : canAssignToAny ? 'Assign to anyone, or leave unassigned for later' : 'Task will be added to your list'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="divide-y divide-border/60">
          <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">

            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title *</Label>
              <Input
                placeholder="What needs to be done?"
                {...register('title')}
                className="rounded-xl border-border/60 focus-visible:ring-indigo-500/20"
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
              <Textarea
                placeholder="Additional context..."
                rows={2}
                {...register('description')}
                className="rounded-xl border-border/60 resize-none focus-visible:ring-indigo-500/20"
              />
            </div>

            {/* Expected Outcome */}
            {!(isTeamMember && isEditMode) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expected Outcome</Label>
                <Input
                  placeholder="What does done look like?"
                  {...register('expectedOutcome')}
                  className="rounded-xl border-border/60 focus-visible:ring-indigo-500/20"
                />
              </div>
            )}

            {/* ── Elevated roles: assignee + dept + priority ── */}
            {canAssignToAny && (
              <>
                {/* Assignee — custom searchable dropdown */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignee</Label>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">optional — can assign later</span>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setUserDropOpen((v) => !v)}
                      className={cn(
                        'w-full flex items-center gap-2 h-9 px-3 rounded-xl border border-border/60 bg-white text-sm transition-all text-left',
                        'hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
                        userDropOpen && 'border-indigo-400 ring-2 ring-indigo-500/20',
                      )}
                    >
                      {watchedAssigneeId ? (
                        <>
                          <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {getInitials(assigneeName ?? '?')}
                          </div>
                          <span className="flex-1 font-medium truncate">{assigneeName}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setValue('assigneeUserId', ''); }}
                            className="h-5 w-5 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="h-6 w-6 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <span className="flex-1 text-muted-foreground">Unassigned — assign later</span>
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </>
                      )}
                    </button>

                    {userDropOpen && (
                      <div className="absolute z-50 top-full mt-1 w-full rounded-xl border border-border/60 bg-white shadow-xl overflow-hidden">
                        {/* Search */}
                        <div className="p-2 border-b border-border/60">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                              autoFocus
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                              placeholder="Search people…"
                              className="w-full h-8 pl-8 pr-3 text-sm rounded-lg border border-border/60 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 bg-muted/20"
                            />
                          </div>
                        </div>

                        {/* Unassigned option */}
                        <button
                          type="button"
                          onClick={() => { setValue('assigneeUserId', ''); setUserDropOpen(false); setUserSearch(''); }}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-indigo-50 transition-colors',
                            !watchedAssigneeId && 'bg-indigo-50',
                          )}
                        >
                          <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-medium text-muted-foreground">Unassigned</p>
                            <p className="text-[10px] text-muted-foreground/60">Assign to someone later</p>
                          </div>
                          {!watchedAssigneeId && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full">Selected</span>}
                        </button>

                        {/* User list */}
                        <div className="max-h-52 overflow-y-auto">
                          {filteredUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No people found</p>
                          ) : (
                            filteredUsers.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => { setValue('assigneeUserId', u.id); setUserDropOpen(false); setUserSearch(''); }}
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-indigo-50 transition-colors',
                                  watchedAssigneeId === u.id && 'bg-indigo-50',
                                )}
                              >
                                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                  {getInitials(u.name)}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <p className="font-medium truncate">{u.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {deptMap.get(u.departmentId ?? '') ?? 'No department'}
                                  </p>
                                </div>
                                {watchedAssigneeId === u.id && (
                                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">✓</span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Department + Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department</Label>
                    </div>
                    <Select
                      value={watchedDeptId || '__none__'}
                      onValueChange={(v) => setValue('departmentId', v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger className="h-9 rounded-xl border-border/60 text-sm">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="__none__">No department</SelectItem>
                        {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</Label>
                    <div className="flex gap-1.5">
                      {(Object.entries(PRIORITY_CONFIG) as [keyof typeof PRIORITY_CONFIG, typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG]][]).map(([key, cfg]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setValue('priority', key)}
                          className={cn(
                            'flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                            watchedPriority === key ? cfg.color : 'border-border/60 bg-white text-muted-foreground hover:border-border',
                          )}
                        >
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Team member: priority only (not edit mode) */}
            {isTeamMember && !isEditMode && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</Label>
                <div className="flex gap-1.5">
                  {(Object.entries(PRIORITY_CONFIG) as [keyof typeof PRIORITY_CONFIG, typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setValue('priority', key)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                        watchedPriority === key ? cfg.color : 'border-border/60 bg-white text-muted-foreground hover:border-border',
                      )}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Due date + time */}
            {!(isTeamMember && isEditMode) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due Date</Label>
                  </div>
                  <Input type="date" {...register('dueDate')} className="rounded-xl border-border/60 h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due Time</Label>
                  </div>
                  <Input type="time" {...register('dueTime')} className="rounded-xl border-border/60 h-9 text-sm" />
                </div>
              </div>
            )}

            {/* Depends On — elevated only */}
            {canAssignToAny && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Depends On</Label>
                </div>
                <Select
                  value={watchedDependencyId || '__none__'}
                  onValueChange={(v) => setValue('dependencyId', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="h-9 rounded-xl border-border/60 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="__none__">None</SelectItem>
                    {allTasks
                      .filter((t) => !taskToEdit || t.id !== taskToEdit.id)
                      .map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Project link */}
            {!isEditMode && availableTeams.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project <span className="text-muted-foreground/60 font-normal normal-case">(optional)</span>
                  </Label>
                </div>
                <Select
                  value={watchedTeamId || '__none__'}
                  onValueChange={(v) => setValue('teamId', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="h-9 rounded-xl border-border/60 text-sm">
                    <SelectValue placeholder="Link to a project..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="__none__">None</SelectItem>
                    {availableTeams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 bg-muted/20">
            {canAssignToAny && !watchedAssigneeId && !isEditMode && (
              <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
                Will be saved as unassigned
              </p>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleClose}
                className="h-9 px-4 rounded-xl border border-border/60 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-9 px-5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-bold hover:from-indigo-600 hover:to-violet-700 transition-all shadow-sm disabled:opacity-60"
              >
                {isSubmitting
                  ? (isEditMode ? 'Saving…' : 'Creating…')
                  : (isEditMode ? 'Save Changes' : isTeamMember ? 'Add Task' : 'Create Task')}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
