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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, getInitials, formatDate, priorityColor, statusColor } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

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
  kra?: { id: string; name: string };
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
    <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', map[role] ?? 'bg-gray-100 text-gray-600')}>
      {labels[role] ?? role}
    </span>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const color = value >= 75 ? 'bg-green-500' : value >= 40 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className={cn('w-full rounded-full bg-muted h-2', className)}>
      <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Teams() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const canManage = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const isTeamMember = user?.role === 'TEAM_MEMBER';

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
  });

  const [deleteError, setDeleteError] = useState('');
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/teams/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setSelectedTeam(null);
      setDeleteError('');
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setDeleteError(err?.response?.data?.error ?? 'Failed to delete team');
    },
  });

  const handleTeamUpdated = (updated: Team) => {
    qc.invalidateQueries({ queryKey: ['teams'] });
    setSelectedTeam(updated);
  };

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project Teams</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
        </div>
        {canManage && (
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Team
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team list */}
        <div className="lg:col-span-1 space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)
          ) : teams.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No teams yet</p>
              {canManage && <p className="text-xs mt-1">Create your first team to get started</p>}
            </div>
          ) : (
            teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className={cn(
                  'w-full text-left rounded-xl border p-4 transition-all hover:shadow-sm',
                  selectedTeam?.id === team.id ? 'border-primary bg-primary/5 shadow-sm' : 'bg-card hover:border-primary/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{team.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{team.department.name}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {(team.manager || team.departmentHead) && (
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {team.manager && (
                      <span className="text-xs text-muted-foreground">
                        Manager: <span className="font-medium text-foreground">{team.manager.name}</span>
                      </span>
                    )}
                    {team.departmentHead && (
                      <span className="text-xs text-muted-foreground">
                        Dept Head: <span className="font-medium text-foreground">{team.departmentHead.name}</span>
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2">
          {selectedTeam ? (
            canManage ? (
              <ProjectOverviewPanel
                team={selectedTeam}
                onUpdated={handleTeamUpdated}
                onDelete={() => { setDeleteError(''); deleteMutation.mutate(selectedTeam.id); }}
                isDeleting={deleteMutation.isPending}
                deleteError={deleteError}
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
            <div className="flex items-center justify-center h-64 rounded-xl border border-dashed text-muted-foreground">
              <div className="text-center">
                <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Select a team to view project details</p>
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

function ProjectOverviewPanel({ team, onUpdated, onDelete, isDeleting, deleteError }: {
  team: Team;
  onUpdated: (t: Team) => void;
  onDelete: () => void;
  isDeleting: boolean;
  deleteError?: string;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl">{team.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{team.department.name}</p>
              {team.description && <p className="text-sm mt-1.5 text-muted-foreground">{team.description}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              {confirmDelete ? (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="destructive" onClick={onDelete} disabled={isDeleting}>
                      {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Manager + Dept Head chips */}
          {(team.manager || team.departmentHead) && (
            <div className="flex gap-3 mt-3 flex-wrap">
              {team.manager && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={team.manager.avatarUrl} />
                    <AvatarFallback className="text-[10px] bg-teal-100 text-teal-700">{getInitials(team.manager.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium leading-none">{team.manager.name}</p>
                    <p className="text-[10px] text-muted-foreground">Manager</p>
                  </div>
                </div>
              )}
              {team.departmentHead && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={team.departmentHead.avatarUrl} />
                    <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">{getInitials(team.departmentHead.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium leading-none">{team.departmentHead.name}</p>
                    <p className="text-[10px] text-muted-foreground">Dept Head</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Progress + stats */}
      {isLoading ? (
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      ) : stats && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" /> Project Progress
              </span>
              <span className="text-lg font-bold text-primary">{stats.completionRate}%</span>
            </div>
            <ProgressBar value={stats.completionRate} className="mb-4" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Tasks', value: stats.total, icon: ClipboardList, color: 'text-gray-600 bg-gray-100' },
                { label: 'Completed', value: stats.done, icon: CheckSquare, color: 'text-green-600 bg-green-50' },
                { label: 'In Progress', value: stats.inProgress + stats.inReview, icon: Clock, color: 'text-blue-600 bg-blue-50' },
                { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className={cn('rounded-lg px-3 py-2.5 flex items-center gap-2.5', color.split(' ')[1])}>
                  <Icon className={cn('h-4 w-4 shrink-0', color.split(' ')[0])} />
                  <div>
                    <p className={cn('text-xl font-bold leading-none', color.split(' ')[0])}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Status breakdown bar */}
            {stats.total > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-1.5">Status breakdown</p>
                <div className="flex rounded-full overflow-hidden h-2.5 gap-0.5">
                  {[
                    { val: stats.done, color: 'bg-green-500' },
                    { val: stats.inProgress, color: 'bg-blue-500' },
                    { val: stats.inReview, color: 'bg-amber-400' },
                    { val: stats.blocked, color: 'bg-red-500' },
                    { val: stats.todo, color: 'bg-gray-300' },
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
                    { label: 'Done', val: stats.done, color: 'bg-green-500' },
                    { label: 'In Progress', val: stats.inProgress, color: 'bg-blue-500' },
                    { label: 'In Review', val: stats.inReview, color: 'bg-amber-400' },
                    { label: 'Blocked', val: stats.blocked, color: 'bg-red-500' },
                    { label: 'To Do', val: stats.todo, color: 'bg-gray-300' },
                  ].filter((s) => s.val > 0).map((s) => (
                    <span key={s.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className={cn('inline-block h-2 w-2 rounded-full', s.color)} />
                      {s.label} ({s.val})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members + per-person tasks */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Team Members ({team.memberCount})</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setAddMemberOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Add Member
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {memberStats.length === 0 && !isLoading ? (
            <div className="text-center py-8 rounded-lg border border-dashed text-muted-foreground">
              <Users className="h-7 w-7 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No members yet — add members to track progress</p>
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
        </CardContent>
      </Card>

      {/* Dialogs */}
      {editOpen && (
        <TeamFormDialog
          open={editOpen}
          team={team}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { onUpdated(updated); setEditOpen(false); qc.invalidateQueries({ queryKey: ['team-overview', team.id] }); }}
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
  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Member header row */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={ms.user.avatarUrl} />
          <AvatarFallback className="text-xs bg-primary/10">{getInitials(ms.user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{ms.user.name}</p>
            <RoleBadge role={ms.user.role} />
            {ms.stats.overdue > 0 && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-0.5">
                <AlertTriangle className="h-3 w-3" /> {ms.stats.overdue} overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ProgressBar value={ms.stats.completionRate} className="flex-1 max-w-[120px]" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {ms.stats.done}/{ms.stats.total} done · {ms.stats.completionRate}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ms.stats.total > 0 && (
            <button
              onClick={onToggle}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {ms.stats.total} task{ms.stats.total !== 1 ? 's' : ''}
            </button>
          )}
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove} disabled={removing}
            title="Remove from team"
          >
            <UserMinus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Mini stats strip */}
      <div className="flex border-t divide-x text-center">
        {[
          { label: 'To Do', val: ms.stats.todo, color: 'text-gray-600' },
          { label: 'In Progress', val: ms.stats.inProgress, color: 'text-blue-600' },
          { label: 'In Review', val: ms.stats.inReview, color: 'text-amber-600' },
          { label: 'Blocked', val: ms.stats.blocked, color: 'text-red-600' },
          { label: 'Done', val: ms.stats.done, color: 'text-green-600' },
        ].map((s) => (
          <div key={s.label} className="flex-1 py-1.5">
            <p className={cn('text-sm font-semibold', s.color)}>{s.val}</p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Expanded task list */}
      {expanded && ms.tasks.length > 0 && (
        <div className="border-t divide-y bg-background">
          {ms.tasks.map((t) => {
            const overdue = t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE' && t.status !== 'CANCELLED';
            return (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm truncate', t.status === 'DONE' && 'line-through text-muted-foreground')}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {t.kra && <span className="text-xs text-muted-foreground truncate max-w-[140px]">KRA: {t.kra.name}</span>}
                    {t.dueDate && (
                      <span className={cn('text-xs', overdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                        {overdue ? '⚠ Overdue · ' : ''}{formatDate(t.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn('text-xs border', priorityColor(t.priority))}>{t.priority}</Badge>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', statusColor(t.status))}>
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

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/teams/${team.id}/members/${userId}`).then((r) => r.data),
    onSuccess: (updated: Team) => { onUpdated(updated); qc.invalidateQueries({ queryKey: ['teams'] }); },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{team.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">{team.department.name}</p>
            {team.description && <p className="text-sm mt-2">{team.description}</p>}
          </div>
          {canManage && (
            <div className="flex items-center gap-1.5 shrink-0">
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="destructive" onClick={onDelete} disabled={isDeleting}>
                    {isDeleting ? 'Deleting…' : 'Confirm'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
        {(team.manager || team.departmentHead) && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {team.manager && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={team.manager.avatarUrl} />
                  <AvatarFallback className="text-[10px] bg-teal-100 text-teal-700">{getInitials(team.manager.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-medium leading-none">{team.manager.name}</p>
                  <p className="text-[10px] text-muted-foreground">Manager</p>
                </div>
              </div>
            )}
            {team.departmentHead && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={team.departmentHead.avatarUrl} />
                  <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">{getInitials(team.departmentHead.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-medium leading-none">{team.departmentHead.name}</p>
                  <p className="text-[10px] text-muted-foreground">Dept Head</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Members ({team.members.length})</h3>
            <div className="flex items-center gap-2">
              {canManage && (
                <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setAddMemberOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Add Member
                </Button>
              )}
            </div>
          </div>
          {team.members.length === 0 ? (
            <div className="text-center py-8 rounded-lg border border-dashed text-muted-foreground">
              <Users className="h-7 w-7 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No members yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {team.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.user.avatarUrl} />
                      <AvatarFallback className="text-xs bg-primary/10">{getInitials(m.user.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{m.user.name}</p>
                      <p className="text-xs text-muted-foreground">{m.user.email}</p>
                    </div>
                    <RoleBadge role={m.user.role} />
                  </div>
                  {canManage && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMember.mutate(m.user.id)}
                      disabled={removeMember.isPending}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {canManage && addMemberOpen && (
        <AddMemberDialog
          open={addMemberOpen}
          team={team}
          onClose={() => setAddMemberOpen(false)}
          onAdded={(updated) => { onUpdated(updated); }}
        />
      )}
    </Card>
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
    const body = { ...data, managerUserId: data.managerUserId || undefined, departmentHeadUserId: data.departmentHeadUserId || undefined };
    const result = isEdit
      ? await api.patch(`/teams/${team!.id}`, body).then((r) => r.data)
      : await api.post('/teams', body).then((r) => r.data);
    reset(); onSaved(result);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && (reset(), onClose())}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Team' : 'Create Team'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Team Name *</Label>
            <Input placeholder="e.g. Frontend Squad" {...register('name')}
              onChange={(e) => { register('name').onChange(e); if (!isEdit) setValue('slug', slugify(e.target.value)); }} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Slug *</Label>
            <Input placeholder="frontend-squad" {...register('slug')} />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="What does this team work on?" rows={2} {...register('description')} />
          </div>
          <div className="space-y-1.5">
            <Label>Department *</Label>
            <Select value={watchedDeptId} onValueChange={(v) => { setValue('departmentId', v); setValue('managerUserId', ''); setValue('departmentHeadUserId', ''); }}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
            {errors.departmentId && <p className="text-xs text-destructive">{errors.departmentId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Manager</Label>
            <Select value={watchedManagerId} onValueChange={(v) => setValue('managerUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Assign a manager (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {deptMembers.filter((u) => ['MANAGER', 'DEPARTMENT_HEAD', 'COMPANY_ADMIN'].includes(u.role))
                  .map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department Head</Label>
            <Select value={watchedDeptHeadId} onValueChange={(v) => setValue('departmentHeadUserId', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Assign a dept head (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {deptUsers.filter((u) => ['DEPARTMENT_HEAD', 'OWNER', 'COMPANY_ADMIN'].includes(u.role))
                  .map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Team')}
            </Button>
          </DialogFooter>
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
  const [error, setError] = useState('');

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
      onAdded(updated); qc.invalidateQueries({ queryKey: ['teams'] });
      setSelectedUserId(''); setError(''); onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err?.response?.data?.error ?? 'Failed to add member');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setSelectedUserId(''); setError(''); onClose(); } }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
        <DialogHeader><DialogTitle>Add Member to {team.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Select Person</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Choose a person…" /></SelectTrigger>
              <SelectContent>
                {eligible.length === 0
                  ? <SelectItem value="__empty__" disabled>All users are already members</SelectItem>
                  : eligible.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} — {u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setSelectedUserId(''); setError(''); onClose(); }}>Cancel</Button>
          <Button disabled={!selectedUserId || addMutation.isPending} onClick={() => addMutation.mutate(selectedUserId)}>
            {addMutation.isPending ? 'Adding…' : 'Add Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

