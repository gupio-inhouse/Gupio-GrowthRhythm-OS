import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2, Users, CheckSquare, Clock, Settings, Plus, Trash2,
  UserPlus, X, ChevronRight, Zap, Shield, Layers,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';
import { toast } from '@/hooks/use-toast';

type Department = {
  id: string; name: string; slug: string;
  standupTime?: string; standupDuration?: number;
  head?: { id: string; name: string; email: string; avatarUrl?: string };
  _count: { users: number; tasks: number };
};

// ── Per-dept color palette (deterministic by name hash) ──────────────────────
const DEPT_PALETTES = [
  { grad: 'from-violet-500 to-purple-600',  ring: 'ring-violet-200',  shadow: 'shadow-violet-200/60',  light: 'bg-violet-50',   text: 'text-violet-700',   border: 'border-violet-200/60' },
  { grad: 'from-blue-500 to-indigo-600',    ring: 'ring-blue-200',    shadow: 'shadow-blue-200/60',    light: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-200/60' },
  { grad: 'from-emerald-500 to-teal-600',   ring: 'ring-emerald-200', shadow: 'shadow-emerald-200/60', light: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200/60' },
  { grad: 'from-rose-500 to-pink-600',      ring: 'ring-rose-200',    shadow: 'shadow-rose-200/60',    light: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200/60' },
  { grad: 'from-amber-500 to-orange-500',   ring: 'ring-amber-200',   shadow: 'shadow-amber-200/60',   light: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200/60' },
  { grad: 'from-cyan-500 to-sky-600',       ring: 'ring-cyan-200',    shadow: 'shadow-cyan-200/60',    light: 'bg-cyan-50',     text: 'text-cyan-700',     border: 'border-cyan-200/60' },
  { grad: 'from-fuchsia-500 to-pink-600',   ring: 'ring-fuchsia-200', shadow: 'shadow-fuchsia-200/60', light: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  border: 'border-fuchsia-200/60' },
  { grad: 'from-lime-500 to-green-600',     ring: 'ring-lime-200',    shadow: 'shadow-lime-200/60',    light: 'bg-lime-50',     text: 'text-lime-700',     border: 'border-lime-200/60' },
];

function deptPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return DEPT_PALETTES[Math.abs(h) % DEPT_PALETTES.length];
}

function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Departments() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scheduleTarget, setScheduleTarget] = useState<Department | null>(null);
  const [createOpen, setCreateOpen]     = useState(false);
  const [createStep, setCreateStep]     = useState<'dept' | 'invite'>('dept');
  const [createdDept, setCreatedDept]   = useState<{ id: string; name: string } | null>(null);
  const [name,  setName]  = useState('');
  const [slug,  setSlug]  = useState('');

  type InviteRow = { name: string; email: string; role: string; status: 'idle' | 'sending' | 'sent' | 'error'; errorMsg?: string };
  const [invites, setInvites] = useState<InviteRow[]>([{ name: '', email: '', role: 'TEAM_MEMBER', status: 'idle' }]);

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  const canConfigure = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');
  const canCreate    = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');
  const qc = useQueryClient();
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);

  const deleteDept = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['cockpit'] });
      setDeleteDeptId(null);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error ?? 'Failed to delete department');
    },
  });

  useEffect(() => {
    if (searchParams.get('create') === 'department') setCreateOpen(true);
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
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Unable to create department');
    },
  });

  const resetCreateDialog = () => {
    setName(''); setSlug('');
    setCreateStep('dept'); setCreatedDept(null);
    setInvites([{ name: '', email: '', role: 'TEAM_MEMBER', status: 'idle' }]);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === toSlug(name)) setSlug(toSlug(value));
  };

  const handleCreateOpen = (open: boolean) => {
    setCreateOpen(open);
    if (!open) { resetCreateDialog(); clearCreateParam(); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/40">
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-200/60">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isLoading ? 'Loading…' : `${departments.length} department${departments.length !== 1 ? 's' : ''} across your org`}
              </p>
            </div>
          </div>

          {canCreate && (
            <button
              onClick={() => handleCreateOpen(true)}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg shadow-violet-200/60 hover:shadow-xl hover:shadow-violet-300/60 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Add Department
            </button>
          )}
        </div>

        {/* ── Department Grid ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-52 rounded-2xl bg-white border border-border/60 animate-pulse" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-white/60 flex flex-col items-center py-20 gap-4 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-violet-300" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-base text-foreground">No departments yet</p>
              <p className="text-sm mt-1">Create your first department to start organising your team</p>
            </div>
            {canCreate && (
              <button
                onClick={() => handleCreateOpen(true)}
                className="mt-1 inline-flex items-center gap-2 h-10 px-5 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm"
              >
                <Plus className="h-4 w-4" /> Create First Department
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => {
              const pal = deptPalette(dept.name);
              return (
                <div key={dept.id} className="group relative">
                  <Link to={`/departments/${dept.slug}`} className="block">
                    <div className={cn(
                      'rounded-2xl border bg-white overflow-hidden transition-all duration-200',
                      'hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer',
                      pal.border,
                      `hover:${pal.shadow}`,
                    )}>
                      {/* Gradient top accent */}
                      <div className={cn('h-1.5 w-full bg-gradient-to-r', pal.grad)} />

                      <div className="p-5">
                        {/* Icon + actions row */}
                        <div className="flex items-start justify-between mb-4">
                          <div className={cn(
                            'h-11 w-11 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-sm',
                            pal.grad,
                            pal.shadow,
                          )}>
                            <Building2 className="h-5 w-5 text-white" />
                          </div>

                          {/* Action buttons — show on hover */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canConfigure && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScheduleTarget(dept); }}
                                className="h-7 w-7 rounded-xl border border-border/60 flex items-center justify-center text-muted-foreground hover:text-violet-600 hover:bg-violet-50 hover:border-violet-200 transition-all"
                                title="Configure meeting schedule"
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canCreate && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteDeptId(dept.id); }}
                                className="h-7 w-7 rounded-xl border border-border/60 flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-all"
                                title="Delete department"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Department name */}
                        <h3 className="font-bold text-base group-hover:text-violet-700 transition-colors">{dept.name}</h3>

                        {/* Head */}
                        {dept.head ? (
                          <div className="flex items-center gap-2 mt-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={dept.head.avatarUrl} />
                              <AvatarFallback className={cn('text-[9px] font-semibold', pal.light, pal.text)}>{getInitials(dept.head.name)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">{dept.head.name}</span>
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', pal.light, pal.text)}>Head</span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2 italic">No head assigned</p>
                        )}

                        {/* Standup time */}
                        {dept.standupTime && (
                          <div className={cn('flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-xl w-fit', pal.light)}>
                            <Clock className={cn('h-3 w-3', pal.text)} />
                            <span className={cn('text-xs font-semibold', pal.text)}>
                              Meeting · {dept.standupTime} · {dept.standupDuration ?? 15}m
                            </span>
                          </div>
                        )}

                        {/* Stats footer */}
                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/60">
                          <div className="flex items-center gap-1.5 text-sm">
                            <div className={cn('h-6 w-6 rounded-lg flex items-center justify-center', pal.light)}>
                              <Users className={cn('h-3 w-3', pal.text)} />
                            </div>
                            <span className="font-bold tabular-nums">{dept._count.users}</span>
                            <span className="text-xs text-muted-foreground">members</span>
                          </div>
                          <div className="h-3 w-px bg-border/60" />
                          <div className="flex items-center gap-1.5 text-sm">
                            <div className={cn('h-6 w-6 rounded-lg flex items-center justify-center', pal.light)}>
                              <CheckSquare className={cn('h-3 w-3', pal.text)} />
                            </div>
                            <span className="font-bold tabular-nums">{dept._count.tasks}</span>
                            <span className="text-xs text-muted-foreground">tasks</span>
                          </div>
                          <div className="flex-1" />
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-violet-500 transition-colors" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Standup Schedule Dialog ── */}
        {scheduleTarget && (
          <StandupScheduleDialog dept={scheduleTarget} onClose={() => setScheduleTarget(null)} />
        )}

        {/* ── Delete Confirm Dialog ── */}
        <Dialog open={!!deleteDeptId} onOpenChange={(v) => { if (!v) setDeleteDeptId(null); }}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </div>
                Delete Department
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the department. Departments with members cannot be deleted — reassign all members first.
            </p>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={() => setDeleteDeptId(null)}
                className="h-9 px-4 rounded-xl border border-border/60 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteDeptId && deleteDept.mutate(deleteDeptId)}
                disabled={deleteDept.isPending}
                className="h-9 px-4 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteDept.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Create Department Dialog ── */}
        <Dialog open={createOpen} onOpenChange={handleCreateOpen}>
          <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-br from-violet-50 to-purple-50/60">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm shadow-violet-200">
                  {createStep === 'dept' ? <Building2 className="h-4 w-4 text-white" /> : <UserPlus className="h-4 w-4 text-white" />}
                </div>
                <div>
                  <h2 className="text-base font-bold">
                    {createStep === 'dept' ? 'Create Department' : `Invite Members — ${createdDept?.name}`}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {createStep === 'dept' ? 'Set up a new department for your org' : 'Add team members to this department'}
                  </p>
                </div>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                  createStep === 'dept' ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white' : 'bg-emerald-500 text-white'
                )}>
                  {createStep === 'dept' ? '1' : '✓'}
                </div>
                <span className={cn('text-xs font-semibold', createStep === 'dept' ? 'text-foreground' : 'text-muted-foreground')}>Department</span>
                <div className="h-px w-8 bg-border/60" />
                <div className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                  createStep === 'invite' ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  2
                </div>
                <span className={cn('text-xs font-semibold', createStep === 'invite' ? 'text-foreground' : 'text-muted-foreground')}>Invite Members</span>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {createStep === 'dept' ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => { e.preventDefault(); createDepartment.mutate(); }}
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Customer Success"
                      className="h-10 rounded-xl border-border/60"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Slug</Label>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(toSlug(e.target.value))}
                      placeholder="customer-success"
                      className="h-10 rounded-xl border-border/60 font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Used in URLs. Lowercase, numbers, hyphens only.</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={() => handleCreateOpen(false)} className="h-9 px-4 rounded-xl border border-border/60 text-sm text-muted-foreground hover:bg-muted transition-colors">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createDepartment.isPending}
                      className="h-9 px-5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm disabled:opacity-50"
                    >
                      {createDepartment.isPending ? 'Creating…' : 'Next: Invite Members →'}
                    </button>
                  </div>
                </form>
              ) : (
                <InviteMembersStep
                  deptId={createdDept!.id}
                  invites={invites}
                  setInvites={setInvites}
                  onDone={() => handleCreateOpen(false)}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}

// ── Invite Members Step ────────────────────────────────────────────────────────

type InviteRow = { name: string; email: string; role: string; status: 'idle' | 'sending' | 'sent' | 'error'; errorMsg?: string };

const ROLE_CONFIG: Record<string, { label: string; cls: string }> = {
  TEAM_MEMBER:     { label: 'Team Member',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  MANAGER:         { label: 'Manager',       cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  DEPARTMENT_HEAD: { label: 'Dept Head',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  COACH_ADVISOR:   { label: 'Advisor',       cls: 'bg-teal-50 text-teal-700 border-teal-200' },
};

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
          await api.post('/users/invite', { name: row.name.trim(), email: row.email.trim(), role: row.role, departmentId: deptId });
          update(i, { status: 'sent' });
        } catch (err: unknown) {
          const e = err as { response?: { data?: { error?: string } } };
          update(i, { status: 'error', errorMsg: e.response?.data?.error ?? 'Failed to send' });
        }
      })
    );
    setSending(false);
  };

  const allSent    = invites.every((r) => r.status === 'sent' || (!r.email.trim() && !r.name.trim()));
  const hasPending = invites.some((r) => r.email.trim() && r.name.trim() && r.status !== 'sent');
  const sentCount  = invites.filter((r) => r.status === 'sent').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add team members to this department. You can skip and invite them later.
      </p>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {invites.map((row, i) => (
          <div key={i} className={cn(
            'rounded-xl border p-3 transition-all',
            row.status === 'sent'    && 'bg-emerald-50 border-emerald-200',
            row.status === 'error'   && 'bg-red-50 border-red-200',
            row.status === 'sending' && 'opacity-70 border-primary/30 bg-primary/5',
            row.status === 'idle'    && 'bg-card border-border/60',
          )}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 placeholder:text-muted-foreground/60 transition-colors disabled:bg-muted/40 disabled:cursor-not-allowed"
                placeholder="Full name"
                value={row.name}
                disabled={row.status === 'sent'}
                onChange={(e) => update(i, { name: e.target.value, status: 'idle' })}
              />
              <input
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 placeholder:text-muted-foreground/60 transition-colors disabled:bg-muted/40 disabled:cursor-not-allowed"
                placeholder="Email address"
                type="email"
                value={row.email}
                disabled={row.status === 'sent'}
                onChange={(e) => update(i, { email: e.target.value, status: 'idle' })}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {Object.entries(ROLE_CONFIG).map(([value, { label, cls }]) => (
                  <button
                    key={value}
                    onClick={() => update(i, { role: value })}
                    disabled={row.status === 'sent'}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all',
                      row.role === value ? cls : 'bg-background text-muted-foreground border-border/60 hover:border-violet-300',
                      row.status === 'sent' && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {row.status === 'sent'    && <span className="text-emerald-600 text-xs font-bold">✓ Sent</span>}
                {row.status === 'sending' && <span className="text-muted-foreground text-xs">Sending…</span>}
                {row.status === 'error'   && <span className="text-red-600 text-xs font-bold" title={row.errorMsg}>! Error</span>}
                {row.status === 'idle' && invites.length > 1 && (
                  <button onClick={() => removeRow(i)} className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {invites.some((r) => r.status === 'error') && (
          <p className="text-xs text-red-600">Some invites failed — check the email addresses and try again.</p>
        )}
      </div>

      <button
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-semibold hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add another member
      </button>

      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        {sentCount > 0 && (
          <span className="text-xs font-semibold text-emerald-600">{sentCount} invite{sentCount > 1 ? 's' : ''} sent</span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={onDone} className="h-9 px-4 rounded-xl border border-border/60 text-sm text-muted-foreground hover:bg-muted transition-colors">
            {allSent ? 'Done' : 'Skip for now'}
          </button>
          {hasPending && (
            <button
              onClick={sendAll}
              disabled={sending}
              className="h-9 px-5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm disabled:opacity-50"
            >
              {sending ? 'Sending…' : `Send Invite${invites.filter((r) => r.email.trim() && r.name.trim() && r.status !== 'sent').length > 1 ? 's' : ''}`}
            </button>
          )}
          {allSent && !hasPending && (
            <button onClick={onDone} className="h-9 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm">
              All Invited — Finish ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Standup Schedule Dialog ───────────────────────────────────────────────────

function StandupScheduleDialog({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const qc = useQueryClient();
  const pal = deptPalette(dept.name);
  const [time,     setTime]     = useState(dept.standupTime || '09:00');
  const [duration, setDuration] = useState(String(dept.standupDuration ?? 15));
  const [saving,   setSaving]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/departments/${dept.id}`, {
        standupTime:     time,
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
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-2xl">

        {/* Header */}
        <div className={cn('px-6 pt-5 pb-4 border-b', pal.light)}>
          <div className="flex items-center gap-3">
            <div className={cn('h-9 w-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm', pal.grad)}>
              <Clock className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">Meeting Schedule</h2>
              <p className={cn('text-xs font-semibold mt-0.5', pal.text)}>{dept.name}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Time config */}
          <div className={cn('rounded-2xl border p-4 space-y-3', pal.border, pal.light + '/40')}>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Daily Meeting Time
              </Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 rounded-xl border-border/60" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Duration (minutes)</Label>
              <Input
                type="number" min={5} max={60}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="h-10 rounded-xl border-border/60"
              />
            </div>
          </div>

          {/* Info note */}
          <div className="rounded-xl bg-indigo-50 border border-indigo-200/60 px-3 py-2.5 flex items-start gap-2">
            <Zap className="h-3.5 w-3.5 text-indigo-600 mt-0.5 shrink-0" />
            <p className="text-xs text-indigo-700">
              The nightly scheduler will auto-create tomorrow's meeting at this time and notify all members 15 min before.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-xl border border-border/60 text-sm text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                'h-9 px-5 rounded-xl text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50',
                `bg-gradient-to-r ${pal.grad}`,
              )}
            >
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
