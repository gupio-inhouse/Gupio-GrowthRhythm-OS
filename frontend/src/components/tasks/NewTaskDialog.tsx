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

const schema = z.object({
  title: z.string().min(2, 'Title required'),
  description: z.string().optional(),
  expectedOutcome: z.string().optional(),
  assigneeUserId: z.string().min(1, 'Assignee required'),
  departmentId: z.string().optional(),
  kraId: z.string().min(1, 'KRA is required — every task must link to a result area'),
  dependencyId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type User = { id: string; name: string; role: string };
type Department = { id: string; name: string };
type KRA = { id: string; name: string };
type Task = { id: string; title: string };

export function NewTaskDialog({ open, onClose, onCreated }: Props) {
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open,
  });

  const { data: kras = [] } = useQuery<KRA[]>({
    queryKey: ['kras'],
    queryFn: () => api.get('/kras').then((r) => r.data),
    enabled: open,
  });

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks-list'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM' },
  });

  const handleClose = () => { reset(); onClose(); };

  const onSubmit = async (data: FormData) => {
    const payload = {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : undefined,
      kraId: data.kraId || undefined,
      departmentId: data.departmentId || undefined,
      dependencyId: data.dependencyId || undefined,
    };
    await api.post('/tasks', payload);
    reset();
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="What needs to be done?" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="Additional context..." rows={2} {...register('description')} />
          </div>

          <div className="space-y-1.5">
            <Label>Expected Outcome</Label>
            <Input placeholder="What does done look like?" {...register('expectedOutcome')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assignee *</Label>
              <Select onValueChange={(v) => setValue('assigneeUserId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assigneeUserId && <p className="text-xs text-destructive">{errors.assigneeUserId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select defaultValue="MEDIUM" onValueChange={(v) => setValue('priority', v as FormData['priority'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select onValueChange={(v) => setValue('departmentId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>KRA *</Label>
              <Select onValueChange={(v) => setValue('kraId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select KRA" />
                </SelectTrigger>
                <SelectContent>
                  {kras.map((k) => (
                    <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.kraId && <p className="text-xs text-destructive">{errors.kraId.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" {...register('dueDate')} />
            </div>

            <div className="space-y-1.5">
              <Label>Depends On</Label>
              <Select onValueChange={(v) => setValue('dependencyId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {allTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
