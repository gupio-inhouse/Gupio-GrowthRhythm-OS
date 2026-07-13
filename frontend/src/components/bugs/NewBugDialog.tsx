import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, isEngineeringDept } from '@/lib/utils';
import { Bug as BugIcon, FolderKanban, User, Monitor } from 'lucide-react';
import api from '@/api/client';
import { toast } from '@/hooks/use-toast';

const bugSchema = z.object({
  title: z.string().min(2, 'Title is required'),
  description: z.string().optional(),
  stepsToReproduce: z.string().optional(),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional(),
  environment: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  teamId: z.string().min(1, 'Project is required'),
  assigneeUserId: z.string().optional(),
});

type FormData = z.infer<typeof bugSchema>;

type TeamItem = {
  id: string; name: string;
  department?: { id: string; name: string };
  members: { user: { id: string; name: string } }[];
};

export type BugToEdit = {
  id: string;
  title: string;
  description?: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  environment?: string;
  severity: string;
  team: { id: string; name: string };
  assignee?: { id: string; name: string } | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  bugToEdit?: BugToEdit | null;
}

const SEVERITY_CONFIG = {
  LOW:      { label: 'Low',      color: 'bg-slate-100 text-slate-700 border-slate-200' },
  MEDIUM:   { label: 'Medium',   color: 'bg-blue-100 text-blue-700 border-blue-200'    },
  HIGH:     { label: 'High',     color: 'bg-amber-100 text-amber-700 border-amber-200' },
  CRITICAL: { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200'       },
} as const;

export function NewBugDialog({ open, onClose, onSaved, bugToEdit }: Props) {
  const isEditMode = !!bugToEdit;

  const { data: teams = [] } = useQuery<TeamItem[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
    enabled: open,
  });
  const engineeringTeams = teams.filter((t) => isEngineeringDept(t.department?.name));

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(bugSchema),
    defaultValues: { severity: 'MEDIUM' },
  });

  const watchedSeverity = (watch('severity') || 'MEDIUM') as keyof typeof SEVERITY_CONFIG;
  const watchedTeamId = watch('teamId') || '';
  const watchedAssigneeId = watch('assigneeUserId') || '';

  const selectedTeam = engineeringTeams.find((t) => t.id === watchedTeamId);
  const teamMembers = selectedTeam?.members.map((m) => m.user) ?? [];

  useEffect(() => {
    if (!open) return;
    if (bugToEdit) {
      reset({
        title: bugToEdit.title,
        description: bugToEdit.description ?? '',
        stepsToReproduce: bugToEdit.stepsToReproduce ?? '',
        expectedBehavior: bugToEdit.expectedBehavior ?? '',
        actualBehavior: bugToEdit.actualBehavior ?? '',
        environment: bugToEdit.environment ?? '',
        severity: bugToEdit.severity as FormData['severity'],
        teamId: bugToEdit.team.id,
        assigneeUserId: bugToEdit.assignee?.id ?? '',
      });
    } else {
      reset({ severity: 'MEDIUM', teamId: engineeringTeams.length === 1 ? engineeringTeams[0].id : '' });
    }
  }, [open, bugToEdit]);

  const handleClose = () => { reset(); onClose(); };

  const onSubmit = async (data: FormData) => {
    const payload: Record<string, unknown> = {
      title: data.title,
      description: data.description || undefined,
      stepsToReproduce: data.stepsToReproduce || undefined,
      expectedBehavior: data.expectedBehavior || undefined,
      actualBehavior: data.actualBehavior || undefined,
      environment: data.environment || undefined,
      severity: data.severity,
      teamId: data.teamId,
      assigneeUserId: data.assigneeUserId || undefined,
    };

    try {
      if (isEditMode && bugToEdit) {
        await api.patch(`/bugs/${bugToEdit.id}`, payload);
        toast.success('Bug updated');
      } else {
        await api.post('/bugs', payload);
        toast.success('Bug reported');
      }
      reset();
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to save bug');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl p-0 gap-0 overflow-hidden rounded-2xl">

        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <BugIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-white font-bold text-base leading-tight">
                {isEditMode ? 'Edit Bug' : 'Report a Bug'}
              </DialogTitle>
              <p className="text-white/70 text-xs mt-0.5">
                {isEditMode ? 'Update bug details' : 'Engineering projects only'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="divide-y divide-border/60">
          <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title *</Label>
              <Input
                placeholder="Short summary of the bug"
                {...register('title')}
                className="rounded-xl border-border/60 focus-visible:ring-red-500/20"
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
              <Textarea
                placeholder="What's wrong?"
                rows={2}
                {...register('description')}
                className="rounded-xl border-border/60 resize-none focus-visible:ring-red-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps to Reproduce</Label>
              <Textarea
                placeholder={'1. Go to...\n2. Click...\n3. See error'}
                rows={3}
                {...register('stepsToReproduce')}
                className="rounded-xl border-border/60 resize-none focus-visible:ring-red-500/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expected Behavior</Label>
                <Textarea
                  placeholder="What should happen"
                  rows={2}
                  {...register('expectedBehavior')}
                  className="rounded-xl border-border/60 resize-none focus-visible:ring-red-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actual Behavior</Label>
                <Textarea
                  placeholder="What actually happens"
                  rows={2}
                  {...register('actualBehavior')}
                  className="rounded-xl border-border/60 resize-none focus-visible:ring-red-500/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Environment</Label>
              </div>
              <Input
                placeholder="e.g. Chrome 126 on macOS, staging build"
                {...register('environment')}
                className="rounded-xl border-border/60 focus-visible:ring-red-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Severity</Label>
              <div className="flex gap-1.5">
                {(Object.entries(SEVERITY_CONFIG) as [keyof typeof SEVERITY_CONFIG, typeof SEVERITY_CONFIG[keyof typeof SEVERITY_CONFIG]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setValue('severity', key)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                      watchedSeverity === key ? cfg.color : 'border-border/60 bg-white text-muted-foreground hover:border-border',
                    )}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project *</Label>
              </div>
              <Select
                value={watchedTeamId || '__none__'}
                onValueChange={(v) => { setValue('teamId', v === '__none__' ? '' : v); setValue('assigneeUserId', ''); }}
              >
                <SelectTrigger className="h-9 rounded-xl border-border/60 text-sm">
                  <SelectValue placeholder="Select an Engineering project..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="__none__" disabled>Select a project...</SelectItem>
                  {engineeringTeams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.teamId && <p className="text-xs text-destructive">{errors.teamId.message}</p>}
              {engineeringTeams.length === 0 && (
                <p className="text-xs text-muted-foreground">No Engineering projects found — ask an admin to create one first.</p>
              )}
            </div>

            {watchedTeamId && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Assign to <span className="text-muted-foreground/60 font-normal normal-case">(optional)</span>
                  </Label>
                </div>
                <Select
                  value={watchedAssigneeId || '__none__'}
                  onValueChange={(v) => setValue('assigneeUserId', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="h-9 rounded-xl border-border/60 text-sm">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {teamMembers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 bg-muted/20">
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
              className="h-9 px-5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white text-sm font-bold hover:from-red-600 hover:to-rose-700 transition-all shadow-sm disabled:opacity-60"
            >
              {isSubmitting
                ? (isEditMode ? 'Saving…' : 'Reporting…')
                : (isEditMode ? 'Save Changes' : 'Report Bug')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
