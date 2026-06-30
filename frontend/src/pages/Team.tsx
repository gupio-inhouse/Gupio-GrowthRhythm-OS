import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserPlus, Search, Users, Shield, Crown, Briefcase, User as UserIcon,
  Mail, Phone, Building2, CheckCircle2, UserX, UserCheck, Pencil, Trash2, FileText, RefreshCw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';
import { toast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamMember = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  managerId?: string;
  department?: { id: string; name: string; slug: string };
};

type Department = {
  id: string;
  name: string;
  slug: string;
};

// ── Color palette ─────────────────────────────────────────────────────────────

const MEMBER_PALETTES = [
  { grad: 'from-violet-500 to-purple-600' },
  { grad: 'from-blue-500 to-indigo-600' },
  { grad: 'from-emerald-500 to-teal-600' },
  { grad: 'from-orange-500 to-amber-600' },
  { grad: 'from-pink-500 to-rose-600' },
  { grad: 'from-cyan-500 to-sky-600' },
  { grad: 'from-amber-500 to-yellow-500' },
  { grad: 'from-slate-500 to-gray-600' },
];

function memberPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return MEMBER_PALETTES[Math.abs(h) % MEMBER_PALETTES.length];
}

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_GRADIENTS: Record<string, string> = {
  OWNER: 'from-amber-500 to-orange-600',
  COMPANY_ADMIN: 'from-purple-500 to-violet-600',
  DEPARTMENT_HEAD: 'from-blue-500 to-indigo-600',
  MANAGER: 'from-teal-500 to-emerald-600',
  TEAM_MEMBER: 'from-slate-400 to-gray-500',
  COACH_ADVISOR: 'from-indigo-500 to-sky-600',
};

const roleConfig: Record<string, { label: string; icon: React.ElementType }> = {
  OWNER: { label: 'Owner', icon: Crown },
  COMPANY_ADMIN: { label: 'Admin', icon: Shield },
  DEPARTMENT_HEAD: { label: 'Dept Head', icon: Briefcase },
  MANAGER: { label: 'Manager', icon: Users },
  TEAM_MEMBER: { label: 'Team Member', icon: UserIcon },
  COACH_ADVISOR: { label: 'Coach/Advisor', icon: UserIcon },
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  OWNER: 'bg-amber-100 text-amber-700',
  COMPANY_ADMIN: 'bg-purple-100 text-purple-700',
  DEPARTMENT_HEAD: 'bg-blue-100 text-blue-700',
  MANAGER: 'bg-teal-100 text-teal-700',
  TEAM_MEMBER: 'bg-gray-100 text-gray-600',
  COACH_ADVISOR: 'bg-indigo-100 text-indigo-700',
};

// ── Schemas ───────────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg = roleConfig[role] || { label: role, icon: UserIcon };
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', ROLE_BADGE_COLORS[role] ?? 'bg-gray-100 text-gray-600')}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white', {
        'bg-emerald-500': status === 'ACTIVE',
        'bg-amber-400': status === 'INVITED',
        'bg-gray-300': status === 'DEACTIVATED',
      })}
      title={status}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Team() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [invited, setInvited] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editMemberForm, setEditMemberForm] = useState({ name: '', role: '', departmentId: '', phone: '', managerId: '' });
  const [editMemberError, setEditMemberError] = useState('');
  const [confirmDeleteMemberId, setConfirmDeleteMemberId] = useState<string | null>(null);

  const canInvite = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(me?.role || '');
  const canBulkImport = ['OWNER', 'COMPANY_ADMIN'].includes(me?.role || '');
  const canInviteOnlyTeamMembers = me?.role === 'MANAGER';
  const canDeactivate = ['OWNER', 'COMPANY_ADMIN'].includes(me?.role || '');
  const canEditUser = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(me?.role || '');
  const canDeleteUser = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(me?.role || '');

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/users/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const updateMember = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/users/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditMemberOpen(false);
      setEditingMember(null);
      setEditMemberError('');
      setEditMemberForm({ name: '', role: '', departmentId: '', phone: '', managerId: '' });
    },
    onError: (e: unknown) => setEditMemberError(e instanceof Error ? e.message : 'Failed to update member'),
  });

  const deleteMember = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setConfirmDeleteMemberId(null);
      toast.success('Member removed', 'Team member has been deleted.');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete member';
      toast.error('Delete failed', msg);
    },
  });

  const reinviteMember = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/resend-invite`).then((r) => r.data as { emailSent: boolean; inviteLink?: string | null }),
    onSuccess: (data) => {
      if (data.emailSent) {
        toast.success('Invite resent', 'A new invite email has been sent.');
      } else if (data.inviteLink) {
        navigator.clipboard.writeText(data.inviteLink).catch(() => {});
        toast.warning('Email not configured', 'Invite link copied to clipboard.');
      } else {
        toast.error('Resend failed', 'Could not resend the invite.');
      }
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to resend invite';
      toast.error('Resend failed', msg);
    },
  });

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

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

  const openEditMember = (member: TeamMember) => {
    setEditingMember(member);
    setEditMemberForm({
      name: member.name,
      role: member.role,
      departmentId: member.department?.id || '',
      phone: member.phone || '',
      managerId: member.managerId || '',
    });
    setEditMemberError('');
    setEditMemberOpen(true);
  };

  const closeInviteDialog = () => {
    setInviteOpen(false);
    setInvited(false);
    setInviteResult(null);
    reset();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/40 p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
            Team
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''} across your organization
          </p>
        </div>
        {(canInvite || canBulkImport) && (
          <div className="flex items-center flex-wrap gap-2">
            {canBulkImport && (
              <button
                onClick={() => setBulkImportOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/60 text-sm font-medium text-slate-600 hover:bg-white hover:shadow-sm transition-all"
              >
                <Users className="h-4 w-4" /> Bulk Import
              </button>
            )}
            {canInvite && (
              <button
                onClick={() => setInviteOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium shadow-sm hover:shadow-md hover:scale-[1.02] transition-all"
              >
                <UserPlus className="h-4 w-4" /> Invite Member
              </button>
            )}
          </div>
        )}
      </div>

      {/* Role breakdown cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(roleConfig).map(([role, cfg]) => {
          const count = roleCounts[role] || 0;
          const Icon = cfg.icon;
          const grad = ROLE_GRADIENTS[role] || 'from-slate-400 to-gray-500';
          const isActive = roleFilter === role;
          return (
            <button
              key={role}
              onClick={() => setRoleFilter(isActive ? '' : role)}
              className={cn(
                'group relative rounded-2xl border overflow-hidden text-left transition-all duration-200 hover:shadow-md hover:scale-[1.02]',
                isActive
                  ? 'border-indigo-300 shadow-md shadow-indigo-100 bg-white'
                  : 'border-border/60 bg-white'
              )}
            >
              <div className={cn('h-1 w-full bg-gradient-to-r', grad)} />
              <div className="p-3">
                <div className={cn('h-8 w-8 rounded-xl bg-gradient-to-br flex items-center justify-center mb-2', grad)}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <p className={cn('text-xs font-semibold truncate', isActive ? 'text-indigo-700' : 'text-slate-600')}>
                  {cfg.label}
                </p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{count}</p>
              </div>
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
            className="pl-9 rounded-xl border-border/60"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-48 rounded-xl border-border/60">
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
          <button
            onClick={() => { setSearch(''); setDeptFilter('all'); setRoleFilter(''); }}
            className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-slate-700 hover:bg-white hover:shadow-sm transition-all border border-border/60"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Members list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white border border-border/60 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
            <Users className="h-8 w-8 text-indigo-400" />
          </div>
          <p className="font-medium text-slate-700">No members found</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => {
            const pal = memberPalette(member.name);
            return (
              <div
                key={member.id}
                className="group rounded-2xl border border-border/60 bg-white shadow-sm hover:shadow-md hover:scale-[1.003] transition-all overflow-hidden"
              >
                <div className="p-4 flex items-center gap-4">
                  {/* Avatar with status dot */}
                  <div className="relative shrink-0">
                    <div className={cn(
                      'h-11 w-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm overflow-hidden',
                      pal.grad
                    )}>
                      {member.avatarUrl
                        ? <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                        : getInitials(member.name)
                      }
                    </div>
                    <StatusDot status={member.status} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 truncate">{member.name}</p>
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

                  {/* Desktop: dept + role + actions */}
                  <div className="hidden md:flex items-center gap-2">
                    {member.department && (
                      <span className="flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg font-medium">
                        <Building2 className="h-3 w-3" />
                        {member.department.name}
                      </span>
                    )}
                    <RoleBadge role={member.role} />
                    {member.status === 'INVITED' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Invited</span>
                    )}
                    {member.status === 'DEACTIVATED' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Deactivated</span>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      <Link
                        to={`/team/${member.id}/report`}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-700 transition-colors"
                        title="View individual report"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Link>
                      {canInvite && member.status === 'INVITED' && (
                        <button
                          onClick={() => reinviteMember.mutate(member.id)}
                          disabled={reinviteMember.isPending}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 hover:text-amber-600 transition-colors disabled:opacity-50"
                          title="Resend invite"
                        >
                          <RefreshCw className={cn('h-3.5 w-3.5', reinviteMember.isPending && 'animate-spin')} />
                        </button>
                      )}
                      {canEditUser && member.id !== me?.id && (
                        <button
                          onClick={() => openEditMember(member)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-700 transition-colors"
                          title="Edit member"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDeactivate && member.id !== me?.id && member.role !== 'OWNER' && (
                        <button
                          onClick={() => toggleStatus.mutate({
                            id: member.id,
                            status: member.status === 'DEACTIVATED' ? 'ACTIVE' : 'DEACTIVATED',
                          })}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-muted-foreground transition-colors"
                          title={member.status === 'DEACTIVATED' ? 'Reactivate member' : 'Deactivate member'}
                        >
                          {member.status === 'DEACTIVATED'
                            ? <UserCheck className="h-4 w-4 text-emerald-600" />
                            : <UserX className="h-4 w-4 text-orange-500" />
                          }
                        </button>
                      )}
                      {canDeleteUser && member.id !== me?.id && member.role !== 'OWNER' &&
                        (me?.role !== 'DEPARTMENT_HEAD' || (
                          member.department?.id === me?.departmentId &&
                          ['TEAM_MEMBER', 'MANAGER'].includes(member.role)
                        )) && (
                        confirmDeleteMemberId === member.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMember.mutate(member.id)}
                              disabled={deleteMember.isPending}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 font-medium transition-colors"
                            >
                              {deleteMember.isPending ? '…' : 'Delete'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteMemberId(null)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteMemberId(member.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Delete member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile: dept + role + report button */}
                <div className="md:hidden px-4 pb-4 pt-3 flex items-center justify-between gap-3 border-t border-border/40">
                  <div className="flex items-center gap-2 min-w-0">
                    {member.department && (
                      <span className="flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-lg font-medium">
                        <Building2 className="h-3 w-3" />
                        {member.department.name}
                      </span>
                    )}
                    <RoleBadge role={member.role} />
                  </div>
                  <Link
                    to={`/team/${member.id}/report`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" /> Report
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { if (open) { setInviteOpen(true); return; } closeInviteDialog(); }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
          <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-5">
            <DialogTitle className="text-white text-lg font-bold">Invite a Team Member</DialogTitle>
            <p className="text-indigo-100 text-sm mt-0.5">
              {canInviteOnlyTeamMembers
                ? 'Managers can invite team members into their own department.'
                : "They'll receive an invitation email to join your workspace."}
            </p>
          </div>

          {invited ? (
            <div className="flex flex-col items-center justify-center p-8 gap-3">
              <div className={cn(
                'h-16 w-16 rounded-2xl flex items-center justify-center',
                inviteResult?.emailSent ? 'bg-emerald-50' : 'bg-amber-50'
              )}>
                <CheckCircle2 className={cn('h-8 w-8', inviteResult?.emailSent ? 'text-emerald-500' : 'text-amber-500')} />
              </div>
              <p className="font-semibold text-slate-800">
                {inviteResult?.emailSent ? 'Invitation email sent!' : 'Invite created'}
              </p>
              <p className="text-sm text-center text-muted-foreground">
                {inviteResult?.emailSent
                  ? 'The invited user can open the email and finish account setup from the magic link.'
                  : 'Share the invite link below manually so the user can finish account setup.'}
              </p>
              {!inviteResult?.emailSent && inviteResult?.inviteLink && (
                <div className="w-full rounded-xl border border-border/60 bg-slate-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Share this invite link</p>
                  <p className="text-xs break-all text-slate-700">{inviteResult.inviteLink}</p>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteResult.inviteLink!)}
                    className="w-full py-2 rounded-xl border border-border/60 text-sm font-medium text-slate-600 hover:bg-white transition-colors"
                  >
                    Copy Invite Link
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={closeInviteDialog}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium hover:shadow-md transition-all mt-1"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit((data) => invite.mutate(data))} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name</Label>
                <Input id="name" placeholder="Priya Sharma" className="rounded-xl border-border/60" {...register('name')} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</Label>
                <Input id="email" type="email" placeholder="priya@company.com" className="rounded-xl border-border/60" {...register('email')} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</Label>
                <Select
                  defaultValue="TEAM_MEMBER"
                  onValueChange={(v) => setValue('role', v as InviteForm['role'])}
                  disabled={canInviteOnlyTeamMembers}
                >
                  <SelectTrigger className="rounded-xl border-border/60"><SelectValue /></SelectTrigger>
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
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Department (optional)</Label>
                  <Select onValueChange={(v) => setValue('departmentId', v)}>
                    <SelectTrigger className="rounded-xl border-border/60"><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone (optional)</Label>
                <Input id="phone" type="tel" placeholder="+91 98765 43210" className="rounded-xl border-border/60" {...register('phone')} />
              </div>

              <div className="border-t border-border/40 pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeInviteDialog}
                  className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={invite.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium hover:shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {invite.isPending ? 'Sending…' : (<><UserPlus className="h-4 w-4" />Send Invite</>)}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={editMemberOpen} onOpenChange={(open) => { if (!open) { setEditMemberOpen(false); setEditingMember(null); setEditMemberError(''); } }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
          <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-5">
            <DialogTitle className="text-white text-lg font-bold">Edit Member</DialogTitle>
            <p className="text-slate-300 text-sm mt-0.5">Update {editingMember?.name}'s profile and role.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingMember) return;
              updateMember.mutate({
                id: editingMember.id,
                data: {
                  name: editMemberForm.name,
                  role: editMemberForm.role,
                  departmentId: editMemberForm.departmentId || null,
                  phone: editMemberForm.phone || '',
                  managerId: editMemberForm.managerId || null,
                },
              });
            }}
            className="p-6 space-y-4"
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name</Label>
              <Input
                value={editMemberForm.name}
                onChange={(e) => setEditMemberForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Full name"
                className="rounded-xl border-border/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</Label>
              <Select value={editMemberForm.role} onValueChange={(v) => setEditMemberForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger className="rounded-xl border-border/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="DEPARTMENT_HEAD">Department Head</SelectItem>
                  <SelectItem value="COMPANY_ADMIN">Admin</SelectItem>
                  <SelectItem value="COACH_ADVISOR">Coach / Advisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Department</Label>
              <Select
                value={editMemberForm.departmentId || 'none'}
                onValueChange={(v) => setEditMemberForm((p) => ({ ...p, departmentId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger className="rounded-xl border-border/60"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reporting Manager</Label>
              <Select
                value={editMemberForm.managerId || 'none'}
                onValueChange={(v) => setEditMemberForm((p) => ({ ...p, managerId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger className="rounded-xl border-border/60"><SelectValue placeholder="No manager assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager</SelectItem>
                  {members
                    .filter((m) =>
                      m.status === 'ACTIVE' &&
                      m.id !== editingMember?.id &&
                      ['MANAGER', 'DEPARTMENT_HEAD', 'COMPANY_ADMIN', 'OWNER'].includes(m.role)
                    )
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                        <span className="text-xs text-muted-foreground ml-1 capitalize">
                          · {m.role.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone (optional)</Label>
              <Input
                type="tel"
                value={editMemberForm.phone}
                onChange={(e) => setEditMemberForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+91 98765 43210"
                className="rounded-xl border-border/60"
              />
            </div>
            {editMemberError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{editMemberError}</p>
            )}
            <div className="border-t border-border/40 pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setEditMemberOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMember.isPending}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 text-white text-sm font-medium hover:shadow-md disabled:opacity-50 transition-all"
              >
                {updateMember.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
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
    </div>
  );
}

// ── Bulk user import ──────────────────────────────────────────────────────────

function BulkUserImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
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
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-5">
          <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
            <Users className="h-5 w-5" /> Bulk User Import
          </DialogTitle>
          <DialogDescription className="text-indigo-100 text-sm mt-0.5">
            Import multiple users at once from a CSV file
          </DialogDescription>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-xs space-y-1">
            <p className="font-semibold text-indigo-800">Required columns: <code className="font-mono">name</code>, <code className="font-mono">email</code></p>
            <p className="text-indigo-600">Optional: <code className="font-mono">role</code> (TEAM_MEMBER/MANAGER/DEPARTMENT_HEAD/COMPANY_ADMIN), <code className="font-mono">phone</code>, <code className="font-mono">departmentId</code></p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select CSV file</Label>
            <Input type="file" accept=".csv" ref={setFileEl} onChange={handleFile} className="rounded-xl border-border/60" />
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="text-xs w-full">
                <thead className="bg-slate-50 border-b border-border/40">
                  <tr>{preview[0].map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.slice(1).map((row, ri) => (
                    <tr key={ri} className="border-t border-border/40">
                      {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && (
            <div className={cn('rounded-xl p-4 text-sm', result.errors.length === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200')}>
              <p className="font-semibold">✓ Created {result.created} users</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => <li key={i} className="text-xs">{e}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleImport}
              disabled={importing || !fileEl?.files?.length}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium hover:shadow-md disabled:opacity-50 transition-all"
            >
              {importing ? 'Importing…' : 'Import Users'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
