import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Users, CheckSquare, Clock, Settings, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

type Department = {
  id: string; name: string; slug: string;
  standupTime?: string; standupDuration?: number;
  head?: { id: string; name: string; email: string; avatarUrl?: string };
  _count: { users: number; tasks: number };
};

export default function Departments() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scheduleTarget, setScheduleTarget] = useState<Department | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'dept' | 'invite'>('dept');
  const [createdDept, setCreatedDept] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  // invite rows state
  type InviteRow = { name: string; email: string; role: string; status: 'idle' | 'sending' | 'sent' | 'error'; errorMsg?: string };
  const [invites, setInvites] = useState<InviteRow[]>([{ name: '', email: '', role: 'TEAM_MEMBER', status: 'idle' }]);
  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  const canConfigure = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');
  const canCreate = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');
  const qc = useQueryClient();
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const deleteDept = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['cockpit'] });
      setDeleteDeptId(null);
      setDeleteError('');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setDeleteError(e.response?.data?.error ?? 'Failed to delete department');
    },
  });

  useEffect(() => {
    if (searchParams.get('create') === 'department') {
      setCreateOpen(true);
    }
  }, [searchParams]);

  const clearCreateParam = () => {
    if (!searchParams.get('create')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const createDepartment = useMutation({
    mutationFn: async () => {
      const finalName = name.trim();
      const finalSlug = slug.trim();

      if (finalName.length < 2) throw new Error('Department name must be at least 2 characters');
      if (finalSlug.length < 2) throw new Error('Department slug must be at least 2 characters');

      return api.post('/departments', { name: finalName, slug: finalSlug });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['cockpit'] });
      setCreatedDept({ id: res.data.id, name: res.data.name });
      setCreateStep('invite');
      setError('');
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to create department');
    },
  });

  const resetCreateDialog = () => {
    setName('');
    setSlug('');
    setError('');
    setCreateStep('dept');
    setCreatedDept(null);
    setInvites([{ name: '', email: '', role: 'TEAM_MEMBER', status: 'idle' }]);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(value));
    }
  };

  const handleCreateOpen = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      resetCreateDialog();
      clearCreateParam();
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-purple-500" />
            Departments
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{departments.length} departments</p>
        </div>
        {canCreate && (
          <Button className="gap-2" onClick={() => handleCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Department
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <Link key={dept.id} to={`/departments/${dept.slug}`}>
              <Card className="group hover:shadow-md hover:border-primary/40 transition-all cursor-pointer h-full">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                    <Building2 className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canConfigure && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScheduleTarget(dept); }}
                        className="text-muted-foreground hover:text-primary p-1 rounded"
                        title="Configure standup schedule"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    )}
                    {canCreate && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteError(''); setDeleteDeptId(dept.id); }}
                        className="text-muted-foreground hover:text-red-600 p-1 rounded"
                        title="Delete department"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="font-semibold text-lg">{dept.name}</h3>

                {dept.head && (
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={dept.head.avatarUrl} />
                      <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(dept.head.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">{dept.head.name}</span>
                  </div>
                )}

                {dept.standupTime && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Standup at {dept.standupTime} · {dept.standupDuration ?? 15} min</span>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{dept._count.users}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckSquare className="h-4 w-4" />
                    <span>{dept._count.tasks} tasks</span>
                  </div>
                </div>
              </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {scheduleTarget && (
        <StandupScheduleDialog
          dept={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
        />
      )}

      <Dialog open={!!deleteDeptId} onOpenChange={(v) => { if (!v) { setDeleteDeptId(null); setDeleteError(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Department</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the department. Departments with members cannot be deleted — reassign all members first.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDeptId(null); setDeleteError(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteDeptId && deleteDept.mutate(deleteDeptId)}
              disabled={deleteDept.isPending}
            >
              {deleteDept.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={handleCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createStep === 'dept' ? (
                <><Building2 className="h-4 w-4 text-purple-500" /> Create Department</>
              ) : (
                <><UserPlus className="h-4 w-4 text-purple-500" /> Invite Members — {createdDept?.name}</>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold', createStep === 'dept' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white')}>
              {createStep === 'dept' ? '1' : '✓'}
            </span>
            <span className={createStep === 'dept' ? 'text-foreground font-medium' : 'text-muted-foreground'}>Department</span>
            <div className="h-px w-6 bg-border" />
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold', createStep === 'invite' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>2</span>
            <span className={createStep === 'invite' ? 'text-foreground font-medium' : 'text-muted-foreground'}>Invite Members</span>
          </div>

          {createStep === 'dept' ? (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); setError(''); createDepartment.mutate(); }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="department-name">Department name</Label>
                <Input
                  id="department-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Customer Success"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="department-slug">Department slug</Label>
                <Input
                  id="department-slug"
                  value={slug}
                  onChange={(e) => setSlug(toSlug(e.target.value))}
                  placeholder="customer-success"
                />
                <p className="text-xs text-muted-foreground">Used in dashboard URLs. Lowercase letters, numbers, and dashes only.</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createDepartment.isPending}>
                  {createDepartment.isPending ? 'Creating...' : 'Next: Invite Members →'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <InviteMembersStep
              deptId={createdDept!.id}
              invites={invites}
              setInvites={setInvites}
              onDone={() => handleCreateOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type InviteRow = { name: string; email: string; role: string; status: 'idle' | 'sending' | 'sent' | 'error'; errorMsg?: string };

function InviteMembersStep({
  deptId, invites, setInvites, onDone,
}: {
  deptId: string;
  invites: InviteRow[];
  setInvites: React.Dispatch<React.SetStateAction<InviteRow[]>>;
  onDone: () => void;
}) {
  const [sending, setSending] = useState(false);

  const update = (i: number, patch: Partial<InviteRow>) =>
    setInvites((prev) => prev.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const addRow = () =>
    setInvites((prev) => [...prev, { name: '', email: '', role: 'TEAM_MEMBER', status: 'idle' }]);

  const removeRow = (i: number) =>
    setInvites((prev) => prev.filter((_, idx) => idx !== i));

  const sendAll = async () => {
    const pending = invites.filter((r) => r.email.trim() && r.name.trim() && r.status !== 'sent');
    if (pending.length === 0) { onDone(); return; }

    setSending(true);
    await Promise.all(
      invites.map(async (row, i) => {
        if (!row.email.trim() || !row.name.trim() || row.status === 'sent') return;
        update(i, { status: 'sending' });
        try {
          await api.post('/users/invite', {
            name: row.name.trim(),
            email: row.email.trim(),
            role: row.role,
            departmentId: deptId,
          });
          update(i, { status: 'sent' });
        } catch (err: unknown) {
          const e = err as { response?: { data?: { error?: string } } };
          update(i, { status: 'error', errorMsg: e.response?.data?.error ?? 'Failed to send' });
        }
      })
    );
    setSending(false);
  };

  const allSent = invites.every((r) => r.status === 'sent' || (!r.email.trim() && !r.name.trim()));
  const hasPending = invites.some((r) => r.email.trim() && r.name.trim() && r.status !== 'sent');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add team members to this department. You can skip this and invite them later from the department page.
      </p>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {invites.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <Input
                placeholder="Full name"
                value={row.name}
                disabled={row.status === 'sent'}
                onChange={(e) => update(i, { name: e.target.value, status: 'idle' })}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Email address"
                type="email"
                value={row.email}
                disabled={row.status === 'sent'}
                onChange={(e) => update(i, { email: e.target.value, status: 'idle' })}
                className="h-8 text-sm"
              />
              <Select
                value={row.role}
                onValueChange={(v) => update(i, { role: v })}
                disabled={row.status === 'sent'}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="DEPARTMENT_HEAD">Dept Head</SelectItem>
                  <SelectItem value="COACH_ADVISOR">Coach / Advisor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status indicator */}
            <div className="shrink-0 mt-1 w-5">
              {row.status === 'sent' && <span className="text-green-500 text-xs">✓</span>}
              {row.status === 'sending' && <span className="text-muted-foreground text-xs">…</span>}
              {row.status === 'error' && <span title={row.errorMsg} className="text-destructive text-xs">!</span>}
              {row.status === 'idle' && invites.length > 1 && (
                <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {invites.some((r) => r.status === 'error') && (
          <p className="text-xs text-destructive">Some invites failed — check the email addresses and try again.</p>
        )}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add another member
      </button>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {allSent ? 'Done' : 'Skip for now'}
        </Button>
        {hasPending && (
          <Button onClick={sendAll} disabled={sending}>
            {sending ? 'Sending...' : `Send Invite${invites.filter((r) => r.email.trim() && r.name.trim() && r.status !== 'sent').length > 1 ? 's' : ''}`}
          </Button>
        )}
        {allSent && !hasPending && (
          <Button onClick={onDone} className="bg-green-600 hover:bg-green-700">All Invited — Finish</Button>
        )}
      </DialogFooter>
    </div>
  );
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function StandupScheduleDialog({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const qc = useQueryClient();
  const [time, setTime] = useState(dept.standupTime || '09:00');
  const [duration, setDuration] = useState(String(dept.standupDuration ?? 15));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/departments/${dept.id}`, {
        standupTime: time,
        standupDuration: parseInt(duration, 10) || 15,
      });
      qc.invalidateQueries({ queryKey: ['departments'] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            Standup Schedule — {dept.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Daily standup time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              min={5}
              max={60}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
