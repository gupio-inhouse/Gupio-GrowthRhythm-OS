import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserPlus, Search, Users, Shield, Crown, Briefcase, User as UserIcon,
  Mail, Phone, Building2, CheckCircle2, Plus, UserX, UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useSearchParams } from 'react-router-dom';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  department?: { id: string; name: string; slug: string };
};

type Department = {
  id: string;
  name: string;
  slug: string;
};

type Team = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  department: { id: string; name: string; slug: string };
  manager?: { id: string; name: string; email: string; avatarUrl?: string };
  memberCount: number;
};

const roleConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  OWNER: { label: 'Owner', icon: Crown, color: 'text-amber-600 bg-amber-50' },
  COMPANY_ADMIN: { label: 'Admin', icon: Shield, color: 'text-purple-600 bg-purple-50' },
  DEPARTMENT_HEAD: { label: 'Dept Head', icon: Briefcase, color: 'text-blue-600 bg-blue-50' },
  MANAGER: { label: 'Manager', icon: Users, color: 'text-teal-600 bg-teal-50' },
  TEAM_MEMBER: { label: 'Team Member', icon: UserIcon, color: 'text-gray-600 bg-gray-100' },
  COACH_ADVISOR: { label: 'Coach/Advisor', icon: UserIcon, color: 'text-indigo-600 bg-indigo-50' },
};

const inviteSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  role: z.enum(['DEPARTMENT_HEAD', 'MANAGER', 'TEAM_MEMBER', 'COACH_ADVISOR']),
  departmentId: z.string().optional(),
  phone: z.string().optional(),
});

type InviteForm = z.infer<typeof inviteSchema>;
type InviteResult = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailSent: boolean;
  inviteLink?: string | null;
};

const teamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters'),
  slug: z.string().min(2, 'Team slug must be at least 2 characters'),
  departmentId: z.string().min(1, 'Department is required'),
  managerUserId: z.string().optional(),
  description: z.string().optional(),
});

type TeamForm = z.infer<typeof teamSchema>;

function RoleBadge({ role }: { role: string }) {
  const cfg = roleConfig[role] || { label: role, icon: UserIcon, color: 'text-gray-600 bg-gray-100' };
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={cn('inline-block h-2 w-2 rounded-full', {
      'bg-green-500': status === 'ACTIVE',
      'bg-yellow-400': status === 'INVITED',
      'bg-gray-300': status === 'DEACTIVATED',
    })} title={status} />
  );
}

export default function Team() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [invited, setInvited] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [teamError, setTeamError] = useState('');
  const [teamForm, setTeamForm] = useState<TeamForm>({
    name: '',
    slug: '',
    departmentId: '',
    managerUserId: '',
    description: '',
  });

  const canInvite = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(me?.role || '');
  const canCreateTeam = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(me?.role || '');
  const canBulkImport = ['OWNER', 'COMPANY_ADMIN'].includes(me?.role || '');
  const canInviteOnlyTeamMembers = me?.role === 'MANAGER';
  const canDeactivate = ['OWNER', 'COMPANY_ADMIN'].includes(me?.role || '');

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/users/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
  });

  const visibleDepartments =
    me?.role === 'MANAGER'
      ? departments.filter((department) => department.id === me.departmentId)
      : departments;

  useEffect(() => {
    if (searchParams.get('create') === 'team') {
      setTeamOpen(true);
    }
  }, [searchParams]);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'TEAM_MEMBER' },
  });

  const invite = useMutation({
    mutationFn: (data: InviteForm) => api.post('/users/invite', data).then((r) => r.data as InviteResult),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setInviteResult(result);
      setInvited(true);
    },
  });

  const createTeam = useMutation({
    mutationFn: async (payload: TeamForm) => {
      const parsed = teamSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || 'Please check the team details');
      }

      return api.post('/teams', {
        ...parsed.data,
        managerUserId: parsed.data.managerUserId || undefined,
        description: parsed.data.description?.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setTeamOpen(false);
      setTeamError('');
      setTeamForm({
        name: '',
        slug: '',
        departmentId: '',
        managerUserId: '',
        description: '',
      });
      clearCreateParam();
    },
    onError: (error: unknown) => {
      setTeamError(error instanceof Error ? error.message : 'Unable to create team');
    },
  });

  const clearCreateParam = () => {
    if (!searchParams.get('create')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const filtered = members.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (deptFilter !== 'all' && m.department?.id !== deptFilter) return false;
    if (roleFilter && m.role !== roleFilter) return false;
    return true;
  });

  const roleCounts = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1;
    return acc;
  }, {});

  const candidateManagers = members.filter((member) => {
    if (member.status !== 'ACTIVE') return false;
    if (!['MANAGER', 'DEPARTMENT_HEAD', 'COMPANY_ADMIN', 'OWNER'].includes(member.role)) return false;
    if (teamForm.departmentId && member.department?.id !== teamForm.departmentId) return false;
    return true;
  });

  const handleTeamOpen = (open: boolean) => {
    setTeamOpen(open);
    if (!open) {
      setTeamError('');
      clearCreateParam();
    }
  };

  const closeInviteDialog = () => {
    setInviteOpen(false);
    setInvited(false);
    setInviteResult(null);
    reset();
  };

  const handleTeamNameChange = (value: string) => {
    setTeamForm((prev) => {
      const currentAutoSlug = toSlug(prev.name);
      const nextName = value;
      const shouldSyncSlug = !prev.slug || prev.slug === currentAutoSlug;
      return {
        ...prev,
        name: nextName,
        slug: shouldSyncSlug ? toSlug(nextName) : prev.slug,
      };
    });
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{teams.length} teams · {members.length} members across your organization</p>
        </div>
        {(canInvite || canCreateTeam || canBulkImport) && (
          <div className="flex items-center gap-2">
            {canCreateTeam && (
              <Button variant="outline" onClick={() => handleTeamOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Team
              </Button>
            )}
            {canBulkImport && (
              <Button variant="outline" onClick={() => setBulkImportOpen(true)} className="gap-2">
                <Users className="h-4 w-4" />
                Bulk Import
              </Button>
            )}
            {canInvite && (
              <Button onClick={() => setInviteOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Invite Member
              </Button>
            )}
          </div>
        )}
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="p-4 flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">How teams work today</p>
            <p className="text-sm text-muted-foreground">
              Teams are created inside a department and led by a manager. Member counts currently reflect that manager&apos;s active direct reports.
            </p>
          </div>
          {canCreateTeam && teams.length === 0 && (
            <Button variant="outline" onClick={() => handleTeamOpen(true)}>
              Create your first team
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {teams.map((team) => (
          <Card key={team.id} className="hover:shadow-sm transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{team.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {team.department.name} · /{team.slug}
                  </p>
                </div>
                <Badge variant="secondary">{team.memberCount} members</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {team.description && (
                <p className="text-sm text-muted-foreground">{team.description}</p>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={team.manager?.avatarUrl} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitials(team.manager?.name || 'TM')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{team.manager?.name || 'Unassigned manager'}</p>
                    <p className="text-xs text-muted-foreground truncate">{team.manager?.email || 'Assign a manager to shape this team'}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Building2 className="h-3 w-3" />
                  {team.department.name}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {teams.length === 0 && (
          <div className="col-span-full text-center py-14 text-muted-foreground border rounded-xl bg-muted/20">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No teams created yet</p>
            <p className="text-sm mt-2">Create a team, pick its department, then assign a manager so reporting starts making sense.</p>
          </div>
        )}
      </div>

      {/* Role breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(roleConfig).map(([role, cfg]) => {
          const count = roleCounts[role] || 0;
          const Icon = cfg.icon;
          return (
            <button
              key={role}
              onClick={() => setRoleFilter(roleFilter === role ? '' : role)}
              className={cn(
                'rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                roleFilter === role ? 'ring-2 ring-primary' : '',
                cfg.color
              )}
            >
              <Icon className="h-4 w-4 mb-1" />
              <p className="text-xs font-medium">{cfg.label}</p>
              <p className="text-xl font-bold mt-0.5">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || deptFilter !== 'all' || roleFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setDeptFilter('all'); setRoleFilter(''); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Members list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>No members found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <Card key={member.id} className="hover:shadow-sm transition-shadow group">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={member.avatarUrl} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <StatusDot status={member.status} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{member.name}</p>
                      {member.id === me?.id && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />{member.email}
                      </span>
                      {member.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />{member.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-3">
                    {member.department && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                        <Building2 className="h-3 w-3" />
                        {member.department.name}
                      </span>
                    )}
                    <RoleBadge role={member.role} />
                    {member.status === 'INVITED' && (
                      <Badge variant="warning" className="text-xs">Invited</Badge>
                    )}
                    {member.status === 'DEACTIVATED' && (
                      <Badge variant="secondary" className="text-xs text-muted-foreground">Deactivated</Badge>
                    )}
                    {canDeactivate && member.id !== me?.id && member.role !== 'OWNER' && (
                      <button
                        onClick={() => toggleStatus.mutate({
                          id: member.id,
                          status: member.status === 'DEACTIVATED' ? 'ACTIVE' : 'DEACTIVATED',
                        })}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                        title={member.status === 'DEACTIVATED' ? 'Reactivate member' : 'Deactivate member'}
                      >
                        {member.status === 'DEACTIVATED'
                          ? <UserCheck className="h-4 w-4 text-green-600" />
                          : <UserX className="h-4 w-4 text-red-500" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => {
        if (open) {
          setInviteOpen(true);
          return;
        }
        closeInviteDialog();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a Team Member</DialogTitle>
            <DialogDescription>
              {canInviteOnlyTeamMembers
                ? 'Managers can invite team members into their own department.'
                : 'They\'ll receive an invitation email to join your workspace.'}
            </DialogDescription>
          </DialogHeader>

          {invited ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <CheckCircle2 className={`h-12 w-12 ${inviteResult?.emailSent ? 'text-green-500' : 'text-amber-500'}`} />
              <p className="font-medium">{inviteResult?.emailSent ? 'Invitation email sent!' : 'Invite created, but email was not sent'}</p>
              <p className="text-sm text-center text-muted-foreground">
                {inviteResult?.emailSent
                  ? 'The invited user can open the email and finish account setup from the magic link.'
                  : 'Share the invite link below manually so the user can finish account setup.'}
              </p>
              {!inviteResult?.emailSent && (
                <>
                  {inviteResult?.inviteLink && (
                    <div className="w-full rounded-lg border bg-muted/40 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Share this invite link manually</p>
                      <p className="text-xs break-all">{inviteResult.inviteLink}</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => navigator.clipboard.writeText(inviteResult.inviteLink!)}
                      >
                        Copy Invite Link
                      </Button>
                    </div>
                  )}
                </>
              )}
              <DialogFooter className="w-full">
                {!inviteResult?.emailSent && inviteResult?.inviteLink && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => navigator.clipboard.writeText(inviteResult.inviteLink!)}
                  >
                    Copy Invite Link Again
                  </Button>
                )}
                <Button type="button" className="w-full" onClick={closeInviteDialog}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit((data) => invite.mutate(data))} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" placeholder="Priya Sharma" {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="priya@company.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  defaultValue="TEAM_MEMBER"
                  onValueChange={(v) => setValue('role', v as InviteForm['role'])}
                  disabled={canInviteOnlyTeamMembers}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
                    {!canInviteOnlyTeamMembers && (
                      <>
                        <SelectItem value="DEPARTMENT_HEAD">Department Head</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="COACH_ADVISOR">Coach / Advisor</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {!canInviteOnlyTeamMembers && (
                <div className="space-y-1.5">
                  <Label>Department (optional)</Label>
                  <Select onValueChange={(v) => setValue('departmentId', v)}>
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
              )}

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" type="tel" placeholder="+91 98765 43210" {...register('phone')} />
              </div>

              <Separator />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeInviteDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={invite.isPending} className="gap-2">
                  {invite.isPending ? 'Sending...' : (<><UserPlus className="h-4 w-4" />Send Invite</>)}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {bulkImportOpen && (
        <BulkUserImportDialog
          onClose={() => setBulkImportOpen(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['users'] });
            setBulkImportOpen(false);
          }}
        />
      )}

      <Dialog open={teamOpen} onOpenChange={handleTeamOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Create a real team under a department and optionally assign a manager.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTeamError('');
              createTeam.mutate(teamForm);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                value={teamForm.name}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                placeholder="Enterprise Sales"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-slug">Team Slug</Label>
              <Input
                id="team-slug"
                value={teamForm.slug}
                onChange={(e) => setTeamForm((prev) => ({ ...prev, slug: toSlug(e.target.value) }))}
                placeholder="enterprise-sales"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Department</Label>
                <Select
                  value={teamForm.departmentId}
                  onValueChange={(value) => setTeamForm((prev) => ({ ...prev, departmentId: value, managerUserId: '' }))}
                >
                  <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                  {visibleDepartments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              </div>

            <div className="space-y-1.5">
              <Label>Manager</Label>
              <Select
                value={teamForm.managerUserId || 'none'}
                onValueChange={(value) => setTeamForm((prev) => ({ ...prev, managerUserId: value === 'none' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager yet</SelectItem>
                  {candidateManagers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name} {manager.department ? `· ${manager.department.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-description">Description</Label>
              <Textarea
                id="team-description"
                value={teamForm.description}
                onChange={(e) => setTeamForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What mission or functional scope does this team own?"
              />
            </div>

            {teamError && <p className="text-sm text-destructive">{teamError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleTeamOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTeam.isPending}>
                {createTeam.isPending ? 'Creating...' : 'Create Team'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Bulk user import ──────────────────────────────────────────────────────────

function BulkUserImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useState<HTMLInputElement | null>(null);
  const [fileEl, setFileEl] = useState<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const parseCsv = (text: string): Record<string, string>[] => {
    const [headerLine, ...rows] = text.trim().split('\n');
    const headers = headerLine.split(',').map((h) => h.trim().replace(/"/g, ''));
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
      setPreview(lines.map((l) => l.split(',').map((c) => c.trim().replace(/"/g, ''))));
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!fileEl?.files?.[0]) return;
    setImporting(true);
    const text = await fileEl.files[0].text();
    const rows = parseCsv(text);
    try {
      const res = await api.post('/users/bulk-import', { rows });
      setResult(res.data);
      if (res.data.created > 0) onImported();
    } catch {
      setResult({ created: 0, errors: ['Import failed.'] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Bulk User Import
          </DialogTitle>
          <DialogDescription>Import multiple users at once from a CSV file</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <p className="font-medium">Required columns: <code>name</code>, <code>email</code></p>
            <p className="text-muted-foreground">Optional: <code>role</code> (TEAM_MEMBER/MANAGER/DEPARTMENT_HEAD/COMPANY_ADMIN), <code>phone</code>, <code>departmentId</code></p>
          </div>
          <div className="space-y-1.5">
            <Label>Select CSV file</Label>
            <Input type="file" accept=".csv" ref={setFileEl} onChange={handleFile} />
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto rounded border">
              <table className="text-xs w-full">
                <thead className="bg-muted"><tr>{preview[0].map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>{preview.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-t">{row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{cell}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {result && (
            <div className={`rounded-md p-3 text-sm ${result.errors.length === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              <p className="font-medium">✓ Created {result.created} users</p>
              {result.errors.length > 0 && (
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => <li key={i} className="text-xs">{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleImport} disabled={importing || !fileEl?.files?.length}>
            {importing ? 'Importing...' : 'Import Users'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
