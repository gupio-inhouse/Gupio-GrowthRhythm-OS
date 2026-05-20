import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, TrendingUp, Trash2, Pencil } from 'lucide-react';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getInitials, kraStatusColor } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

type Goal = {
  id: string;
  title: string;
  type: string;
  status: string;
  target?: number;
  current?: number;
  unit?: string;
  period?: string;
  owner: { id?: string; name: string; avatarUrl?: string };
  _count: { kras: number; subGoals: number };
};

type KRA = {
  id: string;
  name: string;
  status: string;
  target: number;
  current: number;
  unit?: string;
  period: string;
  owner: { name: string; avatarUrl?: string };
  department: { id: string; name: string };
  _count: { tasks: number };
};

type Department = {
  id: string;
  name: string;
};

const goalSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  type: z.enum(['COMPANY', 'DEPARTMENT', 'TEAM']),
  target: z.string().optional(),
  unit: z.string().optional(),
  period: z.string().optional(),
});

const kraSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  departmentId: z.string().min(1, 'Department is required'),
  goalId: z.string().optional(),
  target: z.string().min(1, 'Target is required'),
  unit: z.string().optional(),
  period: z.string().min(2, 'Period is required'),
});

type GoalForm = z.infer<typeof goalSchema>;
type KRAForm = z.infer<typeof kraSchema>;

const EMPTY_GOAL_FORM: GoalForm = {
  title: '',
  description: '',
  type: 'COMPANY',
  target: '',
  unit: '',
  period: '',
};

const EMPTY_KRA_FORM: KRAForm = {
  name: '',
  description: '',
  departmentId: '',
  goalId: '',
  target: '',
  unit: '',
  period: '',
};

export default function Goals() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [goalOpen, setGoalOpen] = useState(false);
  const [kraOpen, setKraOpen] = useState(false);
  const [goalForm, setGoalForm] = useState<GoalForm>(EMPTY_GOAL_FORM);
  const [kraForm, setKraForm] = useState<KRAForm>(EMPTY_KRA_FORM);
  const [goalError, setGoalError] = useState('');
  const [kraError, setKraError] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingKraId, setEditingKraId] = useState<string | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [deleteKraId, setDeleteKraId] = useState<string | null>(null);

  const canManage = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data),
  });

  const { data: kras = [] } = useQuery<KRA[]>({
    queryKey: ['kras'],
    queryFn: () => api.get('/kras').then((r) => r.data),
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  useEffect(() => {
    const create = searchParams.get('create');
    if (create === 'goal') setGoalOpen(true);
    if (create === 'kra') setKraOpen(true);
  }, [searchParams]);

  const clearCreateParam = () => {
    if (!searchParams.get('create')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const linkedGoalOptions = useMemo(
    () => goals.map((goal) => ({ id: goal.id, title: goal.title })),
    [goals]
  );

  const goalMutation = useMutation({
    mutationFn: async (payload: GoalForm) => {
      const parsed = goalSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || 'Please check the goal details');
      }
      if (!user?.id) throw new Error('You must be logged in to create a goal');

      const target = parsed.data.target?.trim();
      const body = {
        title: parsed.data.title.trim(),
        description: parsed.data.description?.trim() || undefined,
        type: parsed.data.type,
        ownerUserId: user.id,
        target: target ? Number(target) : undefined,
        unit: parsed.data.unit?.trim() || undefined,
        period: parsed.data.period?.trim() || undefined,
      };

      return editingGoalId
        ? api.patch(`/goals/${editingGoalId}`, body)
        : api.post('/goals', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      setGoalOpen(false);
      setGoalForm(EMPTY_GOAL_FORM);
      setGoalError('');
      setEditingGoalId(null);
      clearCreateParam();
    },
    onError: (error: unknown) => {
      setGoalError(error instanceof Error ? error.message : 'Unable to save goal');
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['kras'] });
      setDeleteGoalId(null);
    },
  });

  const kraMutation = useMutation({
    mutationFn: async (payload: KRAForm) => {
      const parsed = kraSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || 'Please check the KRA details');
      }
      if (!user?.id) throw new Error('You must be logged in to create a KRA');

      const body = {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || undefined,
        departmentId: parsed.data.departmentId,
        goalId: parsed.data.goalId || undefined,
        ownerUserId: user.id,
        target: Number(parsed.data.target),
        unit: parsed.data.unit?.trim() || undefined,
        period: parsed.data.period.trim(),
      };

      return editingKraId
        ? api.patch(`/kras/${editingKraId}`, body)
        : api.post('/kras', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kras'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['cockpit'] });
      setKraOpen(false);
      setKraForm(EMPTY_KRA_FORM);
      setKraError('');
      setEditingKraId(null);
      clearCreateParam();
    },
    onError: (error: unknown) => {
      setKraError(error instanceof Error ? error.message : 'Unable to save KRA');
    },
  });

  const deleteKraMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/kras/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kras'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      setDeleteKraId(null);
    },
  });

  const openGoalDialog = (goal?: Goal) => {
    setGoalError('');
    if (goal) {
      setEditingGoalId(goal.id);
      setGoalForm({
        title: goal.title,
        description: '',
        type: goal.type as GoalForm['type'],
        target: goal.target != null ? String(goal.target) : '',
        unit: goal.unit || '',
        period: goal.period || '',
      });
    } else {
      setEditingGoalId(null);
      setGoalForm(EMPTY_GOAL_FORM);
    }
    setGoalOpen(true);
  };

  const openKraDialog = (kra?: KRA) => {
    setKraError('');
    if (kra) {
      setEditingKraId(kra.id);
      setKraForm({
        name: kra.name,
        description: '',
        departmentId: kra.department.id,
        goalId: '',
        target: String(kra.target),
        unit: kra.unit || '',
        period: kra.period,
      });
    } else {
      setEditingKraId(null);
      setKraForm(EMPTY_KRA_FORM);
    }
    setKraOpen(true);
  };

  const closeGoalDialog = (open: boolean) => {
    setGoalOpen(open);
    if (!open) {
      setGoalError('');
      setEditingGoalId(null);
      clearCreateParam();
    }
  };

  const closeKraDialog = (open: boolean) => {
    setKraOpen(open);
    if (!open) {
      setKraError('');
      setEditingKraId(null);
      clearCreateParam();
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-500" />
            Goals & KRAs
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{goals.length} goals · {kras.length} KRAs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => openKraDialog()}>
            <Plus className="h-4 w-4" /> Add KRA
          </Button>
          <Button className="gap-2" onClick={() => openGoalDialog()}>
            <Plus className="h-4 w-4" /> Add Goal
          </Button>
        </div>
      </div>

      {goals.length === 0 && kras.length === 0 && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-5 space-y-3">
            <p className="font-medium">Start with a simple planning flow</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>1. Create a company or department goal for the outcome you want.</p>
              <p>2. Add KRAs under that goal to define measurable result areas.</p>
              <p>3. Create tasks against those KRAs so execution rolls up cleanly.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openKraDialog()}>Add KRA</Button>
              <Button onClick={() => openGoalDialog()}>Create First Goal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {goals.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Company Goals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map((goal) => {
              const pct = goal.target && goal.current != null ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
              return (
                <Card key={goal.id} className="group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-medium">{goal.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{goal.period || 'Ongoing'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={goal.status === 'ACTIVE' ? 'info' : goal.status === 'COMPLETED' ? 'success' : 'secondary'}>
                          {goal.status.toLowerCase()}
                        </Badge>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openGoalDialog(goal)}
                              className="opacity-0 group-hover:opacity-100 ml-1 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                              title="Edit goal"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteGoalId(goal.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-opacity"
                              title="Delete goal"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {goal.target != null && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{goal.current?.toLocaleString()} {goal.unit}</span>
                          <span>{goal.target.toLocaleString()} {goal.unit}</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                        <p className="text-xs text-right text-muted-foreground">{pct}% achieved</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={goal.owner.avatarUrl} />
                        <AvatarFallback className="text-xs">{getInitials(goal.owner.name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">{goal.owner.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{goal._count.kras} KRAs</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      {goals.length === 0 && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium text-foreground">No goals created yet</p>
            <p className="text-sm mt-2">Create the first goal to give your KRAs and tasks a clear business outcome.</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-base font-semibold mb-3">Key Result Areas</h2>
        <div className="space-y-3">
          {kras.map((kra) => {
            const pct = kra.target > 0 ? Math.min(100, Math.round((kra.current / kra.target) * 100)) : 0;
            return (
              <Card key={kra.id} className="group">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <p className="font-medium">{kra.name}</p>
                        <Badge className={`text-xs ${kraStatusColor(kra.status)}`}>{kra.status.toLowerCase().replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{kra.department.name} · {kra.period}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex-1">
                          <Progress value={pct} className="h-1.5" />
                        </div>
                        <span className="text-sm font-medium shrink-0 w-20 text-right">
                          {kra.current.toLocaleString()} / {kra.target.toLocaleString()} {kra.unit}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={kra.owner.avatarUrl} />
                        <AvatarFallback className="text-xs bg-blue-50 text-blue-700">{getInitials(kra.owner.name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">{kra._count.tasks} tasks</span>
                      {canManage && (
                        <>
                          <button
                            onClick={() => openKraDialog(kra)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                            title="Edit KRA"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteKraId(kra.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-opacity"
                            title="Delete KRA"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {kras.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No KRAs created yet</p>
              <p className="text-sm mt-2">KRAs turn goals into measurable result areas for a department or function.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={goalOpen} onOpenChange={closeGoalDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingGoalId ? 'Edit Goal' : 'Create Goal'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setGoalError('');
              goalMutation.mutate(goalForm);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="goal-title">Title</Label>
              <Input
                id="goal-title"
                value={goalForm.title}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Increase quarterly revenue"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="goal-description">Description</Label>
              <Textarea
                id="goal-description"
                value={goalForm.description}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What outcome are we driving?"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Goal Type</Label>
                <Select
                  value={goalForm.type}
                  onValueChange={(value: GoalForm['type']) => setGoalForm((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPANY">Company</SelectItem>
                    <SelectItem value="DEPARTMENT">Department</SelectItem>
                    <SelectItem value="TEAM">Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="goal-period">Period</Label>
                <Input
                  id="goal-period"
                  value={goalForm.period}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, period: e.target.value }))}
                  placeholder="Q3 FY2026"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="goal-target">Target</Label>
                <Input
                  id="goal-target"
                  type="number"
                  min="0"
                  step="any"
                  value={goalForm.target}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, target: e.target.value }))}
                  placeholder="100"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="goal-unit">Unit</Label>
                <Input
                  id="goal-unit"
                  value={goalForm.unit}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, unit: e.target.value }))}
                  placeholder="% / deals / INR"
                />
              </div>
            </div>

            {goalError && <p className="text-sm text-destructive">{goalError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeGoalDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={goalMutation.isPending}>
                {goalMutation.isPending ? 'Saving...' : editingGoalId ? 'Save Changes' : 'Create Goal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={kraOpen} onOpenChange={closeKraDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingKraId ? 'Edit KRA' : 'Create KRA'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setKraError('');
              kraMutation.mutate(kraForm);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="kra-name">Name</Label>
              <Input
                id="kra-name"
                value={kraForm.name}
                onChange={(e) => setKraForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Improve conversion from MQL to SQL"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kra-description">Description</Label>
              <Textarea
                id="kra-description"
                value={kraForm.description}
                onChange={(e) => setKraForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What result area are we measuring?"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select
                  value={kraForm.departmentId}
                  onValueChange={(value) => setKraForm((prev) => ({ ...prev, departmentId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Linked Goal</Label>
                <Select
                  value={kraForm.goalId || 'none'}
                  onValueChange={(value) => setKraForm((prev) => ({ ...prev, goalId: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked goal</SelectItem>
                    {linkedGoalOptions.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="kra-target">Target</Label>
                <Input
                  id="kra-target"
                  type="number"
                  min="0"
                  step="any"
                  value={kraForm.target}
                  onChange={(e) => setKraForm((prev) => ({ ...prev, target: e.target.value }))}
                  placeholder="25"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kra-unit">Unit</Label>
                <Input
                  id="kra-unit"
                  value={kraForm.unit}
                  onChange={(e) => setKraForm((prev) => ({ ...prev, unit: e.target.value }))}
                  placeholder="%"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kra-period">Period</Label>
                <Input
                  id="kra-period"
                  value={kraForm.period}
                  onChange={(e) => setKraForm((prev) => ({ ...prev, period: e.target.value }))}
                  placeholder="Q3 FY2026"
                />
              </div>
            </div>

            {kraError && <p className="text-sm text-destructive">{kraError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeKraDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={kraMutation.isPending}>
                {kraMutation.isPending ? 'Saving...' : editingKraId ? 'Save Changes' : 'Create KRA'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Goal confirm */}
      <Dialog open={!!deleteGoalId} onOpenChange={(v) => !v && setDeleteGoalId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Goal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the goal and cannot be undone. Goals with linked KRAs cannot be deleted — remove the KRAs first.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGoalId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteGoalId && deleteGoalMutation.mutate(deleteGoalId)}
              disabled={deleteGoalMutation.isPending}
            >
              {deleteGoalMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete KRA confirm */}
      <Dialog open={!!deleteKraId} onOpenChange={(v) => !v && setDeleteKraId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete KRA</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the KRA. KRAs with linked tasks cannot be deleted — remove the tasks first.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteKraId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteKraId && deleteKraMutation.mutate(deleteKraId)}
              disabled={deleteKraMutation.isPending}
            >
              {deleteKraMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
