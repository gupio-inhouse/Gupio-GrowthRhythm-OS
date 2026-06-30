import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Users, Pencil, Trash2, UserPlus, UserMinus, ClipboardList,
  ChevronRight, X, ChevronDown, ChevronUp, AlertTriangle, Clock,
  CheckSquare, TrendingUp, BarChart2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, getInitials, formatDate, priorityColor, statusColor, isEngineeringDept } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';
import { toast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamUser = { id: string; name: string; email: string; avatarUrl?: string; role: string };
type TeamMember = { id: string; joinedAt: string; user: TeamUser };
type Team = {
  id: string; name: string; slug: string; description?: string;
  department: { id: string; name: string; slug: string };
  manager?: TeamUser;
  departmentHead?: TeamUser;
  members: TeamMember[];
  memberCount: number;
};
type Department = { id: string; name: string; slug: string };
type OrgUser = { id: string; name: string; email: string; avatarUrl?: string; role: string; departmentId?: string };

type TaskSummary = {
  id: string; title: string; status: string; priority: string;
  dueDate?: string; assigneeUserId: string;
  department?: { id: string; name: string };
};
type MemberStat = {
  user: TeamUser;
  joinedAt: string;
  stats: {
    total: number; done: number; inProgress: number; inReview: number;
    blocked: number; todo: number; overdue: number; completionRate: number;
  };
  tasks: TaskSummary[];
};
type ProjectOverview = {
  team: Team;
  stats: {
    total: number; done: number; inProgress: number; inReview: number;
    todo: number; blocked: number; overdue: number; completionRate: number;
  };
  memberStats: MemberStat[];
};

// ── Schemas ───────────────────────────────────────────────────────────────────

const teamSchema = z.object({
  name: z.string().min(2, 'Name required'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens'),
  description: z.string().optional(),
  departmentId: z.string().min(1, 'Department required'),
  managerUserId: z.string().optional(),
  departmentHeadUserId: z.string().optional(),
});
type TeamForm = z.infer<typeof teamSchema>;

// ── Color palette ─────────────────────────────────────────────────────────────

const TEAM_PALETTES = [
  { grad: 'from-violet-500 to-purple-600', shadow: 'hover:shadow-violet-100', light: 'bg-violet-50', text: 'text-violet-700' },
  { grad: 'from-blue-500 to-indigo-600', shadow: 'hover:shadow-blue-100', light: 'bg-blue-50', text: 'text-blue-700' },
  { grad: 'from-emerald-500 to-teal-600', shadow: 'hover:shadow-emerald-100', light: 'bg-emerald-50', text: 'text-emerald-700' },
  { grad: 'from-orange-500 to-amber-600', shadow: 'hover:shadow-orange-100', light: 'bg-orange-50', text: 'text-orange-700' },
  { grad: 'from-pink-500 to-rose-600', shadow: 'hover:shadow-pink-100', light: 'bg-pink-50', text: 'text-pink-700' },
  { grad: 'from-cyan-500 to-sky-600', shadow: 'hover:shadow-cyan-100', light: 'bg-cyan-50', text: 'text-cyan-700' },
  { grad: 'from-amber-500 to-yellow-500', shadow: 'hover:shadow-amber-100', light: 'bg-amber-50', text: 'text-amber-700' },
  { grad: 'from-slate-500 to-gray-600', shadow: 'hover:shadow-slate-100', light: 'bg-slate-50', text: 'text-slate-700' },
];

function teamPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return TEAM_PALETTES[Math.abs(h) % TEAM_PALETTES.length];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked',
  IN_REVIEW: 'In Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    OWNER: 'bg-amber-100 text-amber-700',
    COMPANY_ADMIN: 'bg-purple-100 text-purple-700',
    DEPARTMENT_HEAD: 'bg-blue-100 text-blue-700',
    MANAGER: 'bg-teal-100 text-teal-700',
    TEAM_MEMBER: 'bg-gray-100 text-gray-600',
    COACH_ADVISOR: 'bg-indigo-100 text-indigo-700',
  };
  const labels: Record<string, string> = {
    OWNER: 'Owner', COMPANY_ADMIN: 'Admin', DEPARTMENT_HEAD: 'Dept Head',
    MANAGER: 'Manager', TEAM_MEMBER: 'Member', COACH_ADVISOR: 'Advisor',
  };
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', map[role] ?? 'bg-gray-100 text-gray-600')}>
      {labels[role] ?? role}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Teams() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const canManage = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const isTeamMember = user?.role === 'TEAM_MEMBER';

  const canAccessProjects =
    isEngineeringDept(user?.departmentName) ||
    ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');

  if (!canAccessProjects) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-1">Projects are for Engineering</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Project management is only available to the Engineering department.
        </p>
      </div>
    );
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/teams/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setSelectedTeam(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to delete team');
    },
  });

  const handleTeamUpdated = (updated: Team) => {
    qc.invalidateQueries({ queryKey: ['teams'] });
    setSelectedTeam(updated);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
            Project Teams
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {teams.length} team{teams.length !== 1 ? 's' : ''} across your organization
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium shadow-sm hover:shadow-md hover:scale-[1.02] transition-all"
          >
            <Plus className="h-4 w-4" /> New Team
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team list */}
        <div className="lg:col-span-1 space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-white border border-border/60 animate-pulse" />
            ))
          ) : teams.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-indigo-200 bg-white">
              <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                <Users className="h-7 w-7 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No teams yet</p>
              {canManage && <p className="text-xs mt-1 text-muted-foreground">Create your first team to get started</p>}
            </div>
          ) : (
            teams.map((team) => {
              const pal = teamPalette(team.name);
              const isSelected = selectedTeam?.id === team.id;
              return (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={cn(
                    'group w-full text-left rounded-2xl border overflow-hidden transition-all duration-200',
                    'hover:shadow-lg hover:scale-[1.01]',
                    isSelected
                      ? 'border-indigo-300 shadow-md shadow-indigo-100 bg-white'
                      : `border-border/60 bg-white ${pal.shadow}`
                  )}
                >
                  <div className={cn('h-1 w-full bg-gradient-to-r', pal.grad)} />
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn('h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shrink-0', pal.grad)}>
                        {getInitials(team.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800 truncate">{team.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{team.department.name}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', pal.light, pal.text)}>
                            {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                          </span>
                          {team.manager && (
                            <span className="text-xs text-muted-foreground truncate max-w-[90px]">
                              {team.manager.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={cn(
                        'h-4 w-4 shrink-0 mt-1 transition-all',
                        isSelected ? 'text-indigo-500 translate-x-0.5' : 'text-muted-foreground group-hover:text-indigo-400'
                      )} />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2">
          {selectedTeam ? (
            canManage ? (
              <ProjectOverviewPanel
                team={selectedTeam}
                onUpdated={handleTeamUpdated}
                onDelete={() => deleteMutation.mutate(selectedTeam.id)}
                isDeleting={deleteMutation.isPending}
              />
            ) : (
              <TeamDetail
                team={selectedTeam}
                canManage={false}
                isTeamMember={isTeamMember}
                onUpdated={handleTeamUpdated}
                onDelete={() => deleteMutation.mutate(selectedTeam.id)}
                isDeleting={deleteMutation.isPending}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-64 rounded-2xl border border-dashed border-indigo-200 bg-white">
              <div className="text-center">
                <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                  <BarChart2 className="h-7 w-7 text-indigo-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">Select a team</p>
                <p className="text-xs mt-1 text-muted-foreground">View project details and member progress</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <TeamFormDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSaved={(team) => {
            qc.invalidateQueries({ queryKey: ['teams'] });
            setSelectedTeam(team);
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Project Overview Panel (managers / dept heads) ────────────────────────────

function ProjectOverviewPanel({ team, onUpdated, onDelete, isDeleting }: {
  team: Team;
  onUpdated: (t: Team) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const pal = teamPalette(team.name);

  const { data: overview, isLoading } = useQuery<ProjectOverview>({
    queryKey: ['team-overview', team.id],
    queryFn: () => api.get(`/teams/${team.id}/overview`).then((r) => r.data),
    refetchOnWindowFocus: false,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/teams/${team.id}/members/${userId}`).then((r) => r.data),
    onSuccess: (updated: Team) => {
      onUpdated(updated);
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team-overview', team.id] });
    },
  });

  const stats = overview?.stats;
  const memberStats = overview?.memberStats ?? [];

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-3xl border border-border/60 bg-white shadow-sm overflow-hidden">
        <div className={cn('h-1.5 w-full bg-gradient-to-r', pal.grad)} />
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className={cn('h-12 w-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-base shrink-0', pal.grad)}>
              {getInitials(team.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-800">{team.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{team.department.name}</p>
              {team.description && <p className="text-sm mt-1.5 text-slate-600">{team.description}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              {confirmDelete ? (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={onDelete}
                      disabled={isDeleting}
                      className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                    >
                      {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-xl hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Manager + Dept Head chips */}
          {(team.manager || team.departmentHead) && (
            <div className="flex gap-3 mt-4 flex-wrap">
              {team.manager && (
                <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
                  <Avatar className="h-7 w-7 rounded-lg">
                    <AvatarImage src={team.manager.avatarUrl} />
                    <AvatarFallback className="text-[10px] bg-teal-500 text-white font-bold rounded-lg">
                      {getInitials(team.manager.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-semibold text-teal-800 leading-none">{team.manager.name}</p>
                    <p className="text-[10px] text-teal-600 mt-0.5">Manager</p>
                  </div>
                </div>
              )}
              {team.departmentHead && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                  <Avatar className="h-7 w-7 rounded-lg">
                    <AvatarImage src={team.departmentHead.avatarUrl} />
                    <AvatarFallback className="text-[10px] bg-blue-500 text-white font-bold rounded-lg">
                      {getInitials(team.departmentHead.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-semibold text-blue-800 leading-none">{team.departmentHead.name}</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Dept Head</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats + progress */}
      {isLoading ? (
        <div className="h-48 rounded-2xl bg-white border border-border/60 animate-pulse" />
      ) : stats && (
        <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
          <div className="p-5">
            {/* Progress header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-slate-700">Project Progress</span>
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent">
                {stats.completionRate}%
              </span>
            </div>
            {/* Gradient progress bar */}
            <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden mb-5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all"
                style={{ width: `${Math.min(stats.completionRate, 100)}%` }}
              />
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Tasks', value: stats.total, icon: ClipboardList, grad: 'from-indigo-500 to-violet-600' },
                { label: 'Completed', value: stats.done, icon: CheckSquare, grad: 'from-emerald-500 to-teal-600' },
                { label: 'In Progress', value: stats.inProgress + stats.inReview, icon: Clock, grad: 'from-blue-500 to-sky-600' },
                { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, grad: 'from-red-500 to-rose-600' },
              ].map(({ label, value, icon: Icon, grad }) => (
                <div key={label} className={cn('rounded-2xl p-4 bg-gradient-to-br relative overflow-hidden', grad)}>
                  <div className="absolute top-1 right-2 opacity-20">
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-xs text-white/80 mt-0.5 font-medium">{label}</p>
                </div>
              ))}
            </div>

            {/* Status breakdown */}
            {stats.total > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Status breakdown</p>
                <div className="flex rounded-full overflow-hidden h-2.5 gap-px">
                  {[
                    { val: stats.done, color: 'bg-emerald-500' },
                    { val: stats.inProgress, color: 'bg-blue-500' },
                    { val: stats.inReview, color: 'bg-amber-400' },
                    { val: stats.blocked, color: 'bg-red-500' },
                    { val: stats.todo, color: 'bg-gray-200' },
                  ].filter((s) => s.val > 0).map((s, i) => (
                    <div
                      key={i}
                      className={cn('h-full transition-all', s.color)}
                      style={{ width: `${Math.round((s.val / stats.total) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {[
                    { label: 'Done', val: stats.done, color: 'bg-emerald-500' },
                    { label: 'In Progress', val: stats.inProgress, color: 'bg-blue-500' },
                    { label: 'In Review', val: stats.inReview, color: 'bg-amber-400' },
                    { label: 'Blocked', val: stats.blocked, color: 'bg-red-500' },
                    { label: 'To Do', val: stats.todo, color: 'bg-gray-200' },
                  ].filter((s) => s.val > 0).map((s) => (
                    <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn('inline-block h-2 w-2 rounded-full', s.color)} />
                      {s.label} ({s.val})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Members */}
      <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Team Members</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setAddMemberOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-medium hover:shadow-md hover:scale-[1.02] transition-all"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add Member
          </button>
        </div>
        <div className="p-4 space-y-3">
          {memberStats.length === 0 && !isLoading ? (
            <div className="text-center py-10 rounded-xl border border-dashed border-indigo-200">
              <Users className="h-7 w-7 mx-auto mb-2 text-indigo-300" />
              <p className="text-sm text-muted-foreground">No members yet — add members to track progress</p>
            </div>
          ) : (
            memberStats.map((ms) => (
              <MemberTaskCard
                key={ms.user.id}
                ms={ms}
                expanded={expandedMember === ms.user.id}
                onToggle={() => setExpandedMember(expandedMember === ms.user.id ? null : ms.user.id)}
                onRemove={() => removeMember.mutate(ms.user.id)}
                removing={removeMember.isPending}
              />
            ))
          )}
        </div>
      </div>

      {/* Dialogs */}
      {editOpen && (
        <TeamFormDialog
          open={editOpen}
          team={team}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            onUpdated(updated);
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ['team-overview', team.id] });
          }}
        />
      )}
      {addMemberOpen && (
        <AddMemberDialog
          open={addMemberOpen}
          team={team}
          onClose={() => setAddMemberOpen(false)}
          onAdded={(updated) => {
            onUpdated(updated);
            qc.invalidateQueries({ queryKey: ['team-overview', team.id] });
          }}
        />
      )}
    </div>
  );
}

// ── Member task card (expandable) ─────────────────────────────────────────────

function MemberTaskCard({ ms, expanded, onToggle, onRemove, removing }: {
  ms: MemberStat;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const now = new Date();
  const pal = teamPalette(ms.user.name);
  const rate = ms.stats.completionRate;
  const rateGrad = rate >= 75 ? 'from-emerald-500 to-teal-600' : rate >= 40 ? 'from-blue-500 to-indigo-600' : 'from-amber-500 to-orange-600';

  return (
    <div className="rounded-xl border border-border/60 bg-white overflow-hidden">
      <div className={cn('h-0.5 w-full bg-gradient-to-r', rateGrad)} />

      {/* Member header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={cn('h-9 w-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-xs shrink-0', pal.grad)}>
          {getInitials(ms.user.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800">{ms.user.name}</p>
            <RoleBadge role={ms.user.role} />
            {ms.stats.overdue > 0 && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-0.5 bg-red-50 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" /> {ms.stats.overdue} overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={cn('h-full rounded-full bg-gradient-to-r transition-all', rateGrad)}
                style={{ width: `${Math.min(rate, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {ms.stats.done}/{ms.stats.total} · {rate}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ms.stats.total > 0 && (
            <button
              onClick={onToggle}
              className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {ms.stats.total} task{ms.stats.total !== 1 ? 's' : ''}
            </button>
          )}
          <button
            onClick={onRemove}
            disabled={removing}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Remove from team"
          >
            <UserMinus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Mini stats strip */}
      <div className="flex border-t border-border/40 divide-x divide-border/40 text-center bg-slate-50/60">
        {[
          { label: 'To Do', val: ms.stats.todo, color: 'text-slate-600' },
          { label: 'In Prog', val: ms.stats.inProgress, color: 'text-blue-600' },
          { label: 'Review', val: ms.stats.inReview, color: 'text-amber-600' },
          { label: 'Blocked', val: ms.stats.blocked, color: 'text-red-600' },
          { label: 'Done', val: ms.stats.done, color: 'text-emerald-600' },
        ].map((s) => (
          <div key={s.label} className="flex-1 py-2">
            <p className={cn('text-sm font-bold', s.color)}>{s.val}</p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Expanded task list */}
      {expanded && ms.tasks.length > 0 && (
        <div className="border-t border-border/40 divide-y divide-border/40">
          {ms.tasks.map((t) => {
            const overdue = t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED';
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm truncate', t.status === 'DONE' ? 'line-through text-muted-foreground' : 'text-slate-700')}>
                    {t.title}
                  </p>
                  {t.dueDate && (
                    <span className={cn('text-xs', overdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                      {overdue ? '⚠ Overdue · ' : ''}{formatDate(t.dueDate)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn('text-xs border', priorityColor(t.priority))}>{t.priority}</Badge>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor(t.status))}>
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Team detail (team member view — basic) ────────────────────────────────────

function TeamDetail({
  team, canManage, isTeamMember, onUpdated, onDelete, isDeleting,
}: {
  team: Team; canManage: boolean; isTeamMember: boolean;
  onUpdated: (t: Team) => void; onDelete: () => void; isDeleting: boolean;
}) {
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();
  const pal = teamPalette(team.name);

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/teams/${team.id}/members/${userId}`).then((r) => r.data),
    onSuccess: (updated: Team) => { onUpdated(updated); qc.invalidateQueries({ queryKey: ['teams'] }); },
  });

  return (
    <div className="rounded-3xl border border-border/60 bg-white shadow-sm overflow-hidden">
      <div className={cn('h-1.5 w-full bg-gradient-to-r', pal.grad)} />
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn('h-12 w-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-base shrink-0', pal.grad)}>
            {getInitials(team.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-800">{team.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{team.department.name}</p>
            {team.description && <p className="text-sm mt-2 text-slate-600">{team.description}</p>}
          </div>
          {canManage && (
            <div className="flex items-center gap-1.5 shrink-0">
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="p-1.5 rounded-xl hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-xl hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {(team.manager || team.departmentHead) && (
          <div className="flex gap-3 mt-4 flex-wrap">
            {team.manager && (
              <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
                <Avatar className="h-7 w-7 rounded-lg">
                  <AvatarImage src={team.manager.avatarUrl} />
                  <AvatarFallback className="text-[10px] bg-teal-500 text-white font-bold rounded-lg">
                    {getInitials(team.manager.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-semibold text-teal-800 leading-none">{team.manager.name}</p>
                  <p className="text-[10px] text-teal-600 mt-0.5">Manager</p>
                </div>
              </div>
            )}
            {team.departmentHead && (
              <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                <Avatar className="h-7 w-7 rounded-lg">
                  <AvatarImage src={team.departmentHead.avatarUrl} />
                  <AvatarFallback className="text-[10px] bg-blue-500 text-white font-bold rounded-lg">
                    {getInitials(team.departmentHead.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-semibold text-blue-800 leading-none">{team.departmentHead.name}</p>
                  <p className="text-[10px] text-blue-600 mt-0.5">Dept Head</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Members list */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Members ({team.members.length})</h3>
            {canManage && (
              <button
                onClick={() => setAddMemberOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-medium hover:shadow-md hover:scale-[1.02] transition-all"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add Member
              </button>
            )}
          </div>
          {team.members.length === 0 ? (
            <div className="text-center py-10 rounded-xl border border-dashed border-indigo-200">
              <Users className="h-7 w-7 mx-auto mb-2 text-indigo-300" />
              <p className="text-sm text-muted-foreground">No members yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {team.members.map((m) => {
                const mPal = teamPalette(m.user.name);
                return (
                  <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn('h-9 w-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-xs shrink-0', mPal.grad)}>
                        {getInitials(m.user.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{m.user.name}</p>
                        <p className="text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                      <RoleBadge role={m.user.role} />
                    </div>
                    {canManage && (
                      <button
                        onClick={() => removeMember.mutate(m.user.id)}
                        disabled={removeMember.isPending}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Remove from team"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {canManage && addMemberOpen && (
        <AddMemberDialog
          open={addMemberOpen}
          team={team}
          onClose={() => setAddMemberOpen(false)}
          onAdded={(updated) => { onUpdated(updated); }}
        />
      )}
    </div>
  );
}

// ── Team form dialog (create + edit) ─────────────────────────────────────────

function TeamFormDialog({ open, team, onClose, onSaved }: {
  open: boolean; team?: Team; onClose: () => void; onSaved: (t: Team) => void;
}) {
  const isEdit = !!team;
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open,
  });
  const { data: deptUsers = [] } = useQuery<OrgUser[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<TeamForm>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: team?.name ?? '', slug: team?.slug ?? '', description: team?.description ?? '',
      departmentId: team?.department.id ?? '',
      managerUserId: team?.manager?.id ?? '',
      departmentHeadUserId: team?.departmentHead?.id ?? '',
    },
  });

  const watchedDeptId = watch('departmentId');
  const watchedManagerId = watch('managerUserId') || '';
  const watchedDeptHeadId = watch('departmentHeadUserId') || '';

  const deptMembers = watchedDeptId
    ? deptUsers.filter((u) => u.departmentId === watchedDeptId && u.role !== 'OWNER')
    : deptUsers.filter((u) => u.role !== 'OWNER');

  const onSubmit = async (data: TeamForm) => {
    const body = {
      ...data,
      managerUserId: data.managerUserId || undefined,
      departmentHeadUserId: data.departmentHeadUserId || undefined,
    };
    const result = isEdit
      ? await api.patch(`/teams/${team!.id}`, body).then((r) => r.data)
      : await api.post('/teams', body).then((r) => r.data);
    reset(); onSaved(result);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && (reset(), onClose())}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-5">
          <DialogTitle className="text-white text-lg font-bold">
            {isEdit ? 'Edit Team' : 'Create New Team'}
          </DialogTitle>
          <p className="text-indigo-100 text-sm mt-0.5">
            {isEdit ? 'Update team details and assignments' : 'Set up a new project team'}
          </p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Team Name *</Label>
            <Input
              placeholder="e.g. Frontend Squad"
              className="rounded-xl border-border/60"
              {...register('name')}
              onChange={(e) => { register('name').onChange(e); if (!isEdit) setValue('slug', slugify(e.target.value)); }}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Slug *</Label>
            <Input placeholder="frontend-squad" className="rounded-xl border-border/60" {...register('slug')} />
            {errors.slug && <p className="text-xs text-red-500">{errors.slug.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</Label>
            <Textarea placeholder="What does this team work on?" rows={2} className="rounded-xl border-border/60" {...register('description')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Department *</Label>
            <Select
              value={watchedDeptId}
              onValueChange={(v) => {
                setValue('departmentId', v);
                setValue('managerUserId', '');
                setValue('departmentHeadUserId', '');
              }}
            >
              <SelectTrigger className="rounded-xl border-border/60">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.departmentId && <p className="text-xs text-red-500">{errors.departmentId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Manager</Label>
            <Select value={watchedManagerId} onValueChange={(v) => setValue('managerUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger className="rounded-xl border-border/60">
                <SelectValue placeholder="Assign a manager (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {deptMembers
                  .filter((u) => ['MANAGER', 'DEPARTMENT_HEAD', 'COMPANY_ADMIN'].includes(u.role))
                  .map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Department Head</Label>
            <Select value={watchedDeptHeadId} onValueChange={(v) => setValue('departmentHeadUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger className="rounded-xl border-border/60">
                <SelectValue placeholder="Assign a dept head (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {deptUsers
                  .filter((u) => ['DEPARTMENT_HEAD', 'OWNER', 'COMPANY_ADMIN'].includes(u.role))
                  .map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium hover:shadow-md disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Team')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add member dialog ─────────────────────────────────────────────────────────

function AddMemberDialog({ open, team, onClose, onAdded }: {
  open: boolean; team: Team; onClose: () => void; onAdded: (t: Team) => void;
}) {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const pal = teamPalette(team.name);

  const { data: allUsers = [] } = useQuery<OrgUser[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const existingIds = new Set(team.members.map((m) => m.user.id));
  const eligible = allUsers.filter((u) => !existingIds.has(u.id) && u.role !== 'OWNER');

  const addMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/teams/${team.id}/members`, { userId }).then((r) => r.data),
    onSuccess: (updated: Team) => {
      onAdded(updated);
      qc.invalidateQueries({ queryKey: ['teams'] });
      setSelectedUserId('');
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to add member');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedUserId(''); onClose(); } }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm p-0 gap-0 overflow-hidden rounded-2xl">
        <div className={cn('bg-gradient-to-r px-6 py-5', pal.grad)}>
          <DialogTitle className="text-white text-base font-bold">Add Member</DialogTitle>
          <p className="text-white/80 text-sm mt-0.5">to {team.name}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Person</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="rounded-xl border-border/60">
                <SelectValue placeholder="Choose a person…" />
              </SelectTrigger>
              <SelectContent>
                {eligible.length === 0
                  ? <SelectItem value="__empty__" disabled>All users are already members</SelectItem>
                  : eligible.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} — {u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setSelectedUserId(''); onClose(); }}
              className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!selectedUserId || addMutation.isPending}
              onClick={() => addMutation.mutate(selectedUserId)}
              className={cn('flex-1 py-2.5 rounded-xl bg-gradient-to-r text-white text-sm font-medium hover:shadow-md disabled:opacity-50 transition-all', pal.grad)}
            >
              {addMutation.isPending ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
