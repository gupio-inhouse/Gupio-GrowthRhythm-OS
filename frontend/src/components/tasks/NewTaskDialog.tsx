import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';

const managerSchema = z.object({
  title: z.string().min(2, 'Title required'),
  description: z.string().optional(),
  expectedOutcome: z.string().optional(),
  assigneeUserId: z.string().min(1, 'Assignee required'),
  departmentId: z.string().optional(),
  dependencyId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
});

const teamMemberSchema = z.object({
  title: z.string().min(2, 'Title required'),
  description: z.string().optional(),
  expectedOutcome: z.string().optional(),
  assigneeUserId: z.string().optional(),
  departmentId: z.string().optional(),
  dependencyId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
});

type ManagerFormData = z.infer<typeof managerSchema>;
type TeamMemberFormData = z.infer<typeof teamMemberSchema>;
type FormData = ManagerFormData | TeamMemberFormData;

type UserItem = { id: string; name: string; role: string; departmentId?: string };
type Department = { id: string; name: string };
type TaskItem = { id: string; title: string };
type TeamItem = { id: string; name: string; members: { user: { id: string } }[] };

export type TaskToEdit = {
  id: string;
  title: string;
  description?: string;
  expectedOutcome?: string;
  priority: string;
  dueDate?: string;
  assignee: { id: string; name: string };
  department?: { id: string; name: string };
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  taskToEdit?: TaskToEdit | null;
}

export function NewTaskDialog({ open, onClose, onCreated, taskToEdit }: Props) {
  const { user } = useAuthStore();
  const isTeamMember = user?.role === 'TEAM_MEMBER';
  const isEditMode = !!taskToEdit;
  const activeSchema = isTeamMember ? teamMemberSchema : managerSchema;

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open && !isTeamMember,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open && !isTeamMember,
  });

  const { data: allTasks = [] } = useQuery<TaskItem[]>({
    queryKey: ['tasks-list'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
    enabled: open && !isTeamMember,
  });

  const { data: teams = [] } = useQuery<TeamItem[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
    enabled: open && !isTeamMember,
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(activeSchema as z.ZodType<FormData>),
    defaultValues: { priority: 'MEDIUM' },
  });

  const selectedDepartmentId = watch('departmentId');
  const watchedPriority = watch('priority') || 'MEDIUM';
  const watchedAssigneeId = watch('assigneeUserId') || '';
  const watchedDependencyId = watch('dependencyId') || '';

  useEffect(() => {
    if (!open) return;
    if (taskToEdit) {
      reset({
        title: taskToEdit.title,
        description: taskToEdit.description ?? '',
        expectedOutcome: taskToEdit.expectedOutcome ?? '',
        priority: taskToEdit.priority as FormData['priority'],
        assigneeUserId: taskToEdit.assignee.id,
        departmentId: taskToEdit.department?.id ?? '',
        dueDate: taskToEdit.dueDate ? new Date(taskToEdit.dueDate).toISOString().split('T')[0] : '',
        dueTime: (() => {
          if (!taskToEdit.dueDate) return '';
          const d = new Date(taskToEdit.dueDate);
          const h = d.getHours(), m = d.getMinutes();
          // 23:59 is the end-of-day default — treat as "no specific time"
          if (h === 23 && m === 59) return '';
          return (h !== 0 || m !== 0)
            ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            : '';
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

  const handleClose = () => { reset(); onClose(); };

  const onSubmit = async (data: FormData) => {
    const payload: Record<string, unknown> = isTeamMember && isEditMode
      ? {
          title: data.title,
          description: data.description || undefined,
        }
      : (() => {
          const dueDate = data.dueDate;
          const dueTime = data.dueTime;
          let dueDateIso: string | undefined;
          if (dueDate) {
            dueDateIso = new Date(`${dueDate}T${dueTime || '23:59:59'}`).toISOString();
          }
          return {
            title: data.title,
            description: data.description || undefined,
            expectedOutcome: data.expectedOutcome || undefined,
            assigneeUserId: isTeamMember ? user!.id : data.assigneeUserId,
            departmentId: data.departmentId || undefined,
            dependencyId: data.dependencyId || undefined,
            priority: data.priority,
            dueDate: dueDateIso,
          };
        })();

    if (isEditMode && taskToEdit) {
      await api.patch(`/tasks/${taskToEdit.id}`, payload);
    } else {
      await api.post('/tasks', payload);
    }
    reset();
    onCreated();
    onClose();
  };

  const departmentUsers = selectedDepartmentId
    ? users.filter((u) => u.departmentId === selectedDepartmentId)
    : [];

  const assigneeTeams = watchedAssigneeId
    ? teams.filter((t) => t.members.some((m) => m.user.id === watchedAssigneeId))
    : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Task' : isTeamMember ? 'Add My Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="What needs to be done?" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="Additional context..." rows={2} {...register('description')} />
          </div>

          {/* Expected Outcome — hidden for team members in edit mode */}
          {!(isTeamMember && isEditMode) && (
            <div className="space-y-1.5">
              <Label>Expected Outcome</Label>
              <Input placeholder="What does done look like?" {...register('expectedOutcome')} />
            </div>
          )}

          {/* Manager/DeptHead/Owner view: Department + Priority */}
          {!isTeamMember && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select
                  value={selectedDepartmentId || ''}
                  onValueChange={(v) => {
                    setValue('departmentId', v);
                    setValue('assigneeUserId', '');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={watchedPriority} onValueChange={(v) => setValue('priority', v as FormData['priority'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Manager/DeptHead/Owner view: Assignee */}
          {!isTeamMember && (
            <div className="space-y-1.5">
              <Label>Assignee *</Label>
              <Select
                value={watchedAssigneeId}
                onValueChange={(v) => setValue('assigneeUserId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedDepartmentId ? 'Select person' : 'Select department first'} />
                </SelectTrigger>
                <SelectContent>
                  {departmentUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {'assigneeUserId' in errors && errors.assigneeUserId && (
                <p className="text-xs text-destructive">{(errors.assigneeUserId as { message?: string }).message}</p>
              )}
              {assigneeTeams.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Team{assigneeTeams.length > 1 ? 's' : ''}: <span className="font-medium text-foreground">{assigneeTeams.map((t) => t.name).join(', ')}</span>
                </p>
              )}
            </div>
          )}

          {/* Team member view: Priority — hidden in edit mode */}
          {isTeamMember && !isEditMode && (
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={watchedPriority} onValueChange={(v) => setValue('priority', v as FormData['priority'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Due Date + Time — hidden for team members in edit mode */}
          {!(isTeamMember && isEditMode) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" {...register('dueDate')} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Time</Label>
                <Input type="time" {...register('dueTime')} />
              </div>
            </div>
          )}

          {/* Depends On (managers only) */}
          {!isTeamMember && (
            <div className="space-y-1.5">
              <Label>Depends On</Label>
              <Select
                value={watchedDependencyId}
                onValueChange={(v) => setValue('dependencyId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {allTasks
                    .filter((t) => !taskToEdit || t.id !== taskToEdit.id)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save Changes' : isTeamMember ? 'Add Task' : 'Create Task')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
