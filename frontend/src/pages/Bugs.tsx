import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Bug as BugIcon, Clock, Search, LayoutGrid, List,
  CheckCircle2, Filter, ArrowUpRight, RotateCcw, XCircle, KeyRound,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, formatRelative, getInitials } from '@/lib/utils';
import { NewBugDialog } from '@/components/bugs/NewBugDialog';
import { BugDetailDrawer } from '@/components/bugs/BugDetailDrawer';
import { BugAccessDialog } from '@/components/bugs/BugAccessDialog';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';

type Bug = {
  id: string; title: string; status: string; severity: string; createdAt: string;
  reporter: { id: string; name: string; avatarUrl?: string };
  assignee?: { id: string; name: string; avatarUrl?: string } | null;
  team: { id: string; name: string };
  department?: { id: string; name: string };
  _count?: { comments: number; attachments: number };
};

const STATUSES = ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'REOPENED', 'FIXED', 'CLOSED', 'WONT_FIX', 'DUPLICATE'];
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review', REOPENED: 'Reopened',
  FIXED: 'Fixed', CLOSED: 'Closed', WONT_FIX: "Won't Fix", DUPLICATE: 'Duplicate',
};

const S: Record<string, { dot: string; badge: string; bar: string; accent: string }> = {
  OPEN:        { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',   bar: '#94a3b8', accent: '#94a3b8' },
  IN_PROGRESS: { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',      bar: '#3b82f6', accent: '#3b82f6' },
  IN_REVIEW:   { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',   bar: '#f59e0b', accent: '#f59e0b' },
  REOPENED:    { dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200', bar: '#f97316', accent: '#f97316' },
  FIXED:       { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: '#10b981', accent: '#10b981' },
  CLOSED:      { dot: 'bg-gray-400',    badge: 'bg-gray-50 text-gray-600 border-gray-200',      bar: '#9ca3af', accent: '#9ca3af' },
  WONT_FIX:    { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',      bar: '#d1d5db', accent: '#d1d5db' },
  DUPLICATE:   { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',      bar: '#d1d5db', accent: '#d1d5db' },
};

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH:     'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM:   'bg-blue-50 text-blue-700 border-blue-200',
  LOW:      'bg-gray-50 text-gray-500 border-gray-200',
};

const PAGE_SIZE = 12;
function paginate<T>(items: T[], page: number): T[] {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

export default function Bugs() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [mineFilter, setMineFilter] = useState<'' | 'reported' | 'assigned'>('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'kanban'>('kanban');
  const [newBugOpen, setNewBugOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(() => searchParams.get('bugId'));

  const { data: bugs = [], isLoading } = useQuery<Bug[]>({
    queryKey: ['bugs'],
    queryFn: () => api.get('/bugs').then((r) => r.data),
  });

  const { data: teams = [] } = useQuery<{ id: string; name: string; department?: { name: string } }[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
  });
  const engineeringProjects = teams.filter((t) => (t.department?.name || '').toLowerCase().includes('engineering'));

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api.patch(`/bugs/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bugs'] }),
  });

  const openBug = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('bugId', id);
    setSearchParams(next);
    setSelectedBugId(id);
  };
  const closeBug = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('bugId');
    setSearchParams(next);
    setSelectedBugId(null);
  };

  const resetPage = () => setPage(1);

  const filtered = bugs.filter((b) => {
    if (search) {
      const q = search.toLowerCase();
      if (!b.title.toLowerCase().includes(q) && !b.reporter.name.toLowerCase().includes(q) && !(b.assignee?.name.toLowerCase().includes(q))) return false;
    }
    if (projectFilter && b.team.id !== projectFilter) return false;
    if (severityFilter && b.severity !== severityFilter) return false;
    if (mineFilter === 'reported' && b.reporter.id !== user?.id) return false;
    if (mineFilter === 'assigned' && b.assignee?.id !== user?.id) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    return true;
  });

  const preStatusFiltered = bugs.filter((b) => {
    if (search) {
      const q = search.toLowerCase();
      if (!b.title.toLowerCase().includes(q) && !b.reporter.name.toLowerCase().includes(q) && !(b.assignee?.name.toLowerCase().includes(q))) return false;
    }
    if (projectFilter && b.team.id !== projectFilter) return false;
    if (severityFilter && b.severity !== severityFilter) return false;
    if (mineFilter === 'reported' && b.reporter.id !== user?.id) return false;
    if (mineFilter === 'assigned' && b.assignee?.id !== user?.id) return false;
    return true;
  });

  const counts = {
    OPEN: preStatusFiltered.filter((b) => b.status === 'OPEN').length,
    IN_PROGRESS: preStatusFiltered.filter((b) => b.status === 'IN_PROGRESS').length,
    IN_REVIEW: preStatusFiltered.filter((b) => b.status === 'IN_REVIEW').length,
    REOPENED: preStatusFiltered.filter((b) => b.status === 'REOPENED').length,
    FIXED: preStatusFiltered.filter((b) => b.status === 'FIXED').length,
    CLOSED: preStatusFiltered.filter((b) => ['CLOSED', 'WONT_FIX', 'DUPLICATE'].includes(b.status)).length,
  };

  const KPI_TILES = [
    { label: 'Open',        key: 'OPEN',        icon: BugIcon,       from: 'from-slate-500',   to: 'to-gray-600',   shadow: 'shadow-slate-200' },
    { label: 'In Progress', key: 'IN_PROGRESS', icon: Clock,         from: 'from-blue-500',    to: 'to-indigo-600', shadow: 'shadow-blue-200' },
    { label: 'In Review',   key: 'IN_REVIEW',   icon: Clock,         from: 'from-amber-500',   to: 'to-orange-600', shadow: 'shadow-amber-200' },
    { label: 'Reopened',    key: 'REOPENED',    icon: RotateCcw,     from: 'from-orange-500',  to: 'to-red-500',    shadow: 'shadow-orange-200' },
    { label: 'Fixed',       key: 'FIXED',       icon: CheckCircle2,  from: 'from-emerald-500', to: 'to-green-600',  shadow: 'shadow-green-200' },
    { label: 'Closed',      key: 'CLOSED',      icon: XCircle,       from: 'from-gray-400',    to: 'to-gray-500',   shadow: 'shadow-gray-200' },
  ];

  const activeFilters = [search, statusFilter, severityFilter, projectFilter, mineFilter].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50/40">
      <div className="p-4 sm:p-6 lg:p-8 space-y-5">

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-200 shrink-0">
              <BugIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Bug Tracker</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {filtered.length} of {bugs.length} bug{bugs.length !== 1 ? 's' : ''}
                {activeFilters > 0 && <span className="ml-1 text-primary font-semibold">· {activeFilters} filter{activeFilters > 1 ? 's' : ''} active</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-border/60 bg-white overflow-hidden shadow-sm p-0.5 gap-0.5">
              {([['list', List], ['kanban', LayoutGrid]] as const).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    view === v
                      ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            {user?.role === 'OWNER' && (
              <button
                onClick={() => setAccessOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-white px-3 py-2 text-xs font-semibold hover:border-red-300 hover:shadow-sm transition-all text-foreground/80"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Manage Access</span>
              </button>
            )}

            <button
              onClick={() => setNewBugOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-3 sm:px-4 py-2 text-xs font-bold text-white hover:from-red-600 hover:to-rose-700 shadow-sm shadow-red-200 transition-all"
            >
              <Plus className="h-4 w-4" />
              Report Bug
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-border/60 bg-white shadow-sm p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or person…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="pl-9 rounded-xl border-border/60 bg-muted/20 focus-visible:bg-white h-9 text-sm"
              />
            </div>

            <Select
              value={projectFilter || '__all__'}
              onValueChange={(v) => { setProjectFilter(v === '__all__' ? '' : v); resetPage(); }}
            >
              <SelectTrigger className="w-full sm:w-44 h-9 text-sm rounded-xl border-border/60">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="__all__">All Projects</SelectItem>
                {engineeringProjects.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={severityFilter || '__all__'}
              onValueChange={(v) => { setSeverityFilter(v === '__all__' ? '' : v); resetPage(); }}
            >
              <SelectTrigger className="w-full sm:w-36 h-9 text-sm rounded-xl border-border/60">
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="__all__">All Severities</SelectItem>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex rounded-xl border border-border/60 bg-white overflow-hidden shrink-0">
              {([['', 'All'], ['reported', 'Reported by me'], ['assigned', 'Assigned to me']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => { setMineFilter(v); resetPage(); }}
                  className={cn(
                    'px-3 h-9 text-xs font-semibold transition-all whitespace-nowrap',
                    mineFilter === v ? 'bg-red-600 text-white' : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeFilters > 0 && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setSeverityFilter(''); setProjectFilter(''); setMineFilter(''); resetPage(); }}
                className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-border/60 px-3 text-xs font-semibold text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all shrink-0"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-nowrap">
            {[{ val: '', label: 'All', dot: '' }, ...STATUSES.map((s) => ({ val: s, label: STATUS_LABELS[s], dot: S[s].bar }))].map(({ val, label, dot }) => {
              const active = statusFilter === val;
              return (
                <button
                  key={val}
                  onClick={() => { setStatusFilter(val); resetPage(); }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap shrink-0',
                    active
                      ? 'bg-red-600 text-white border-red-600 shadow-sm'
                      : 'border-border/60 bg-white text-muted-foreground hover:border-red-200 hover:text-red-700 hover:bg-red-50/50',
                  )}
                >
                  {dot ? <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} /> : <Filter className="h-3 w-3" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {KPI_TILES.map(({ label, key, icon: Icon, from, to, shadow }) => {
            const active = statusFilter === key || (key === 'CLOSED' && ['CLOSED', 'WONT_FIX', 'DUPLICATE'].includes(statusFilter));
            return (
              <button
                key={key}
                onClick={() => { setStatusFilter(active ? '' : key); resetPage(); }}
                className={cn('group text-left rounded-2xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary', active ? 'scale-[1.03]' : 'hover:scale-[1.02]')}
              >
                <Card className={cn(
                  'relative overflow-hidden rounded-2xl border-0 shadow-md transition-all duration-200 bg-gradient-to-br',
                  from, to, shadow,
                  active ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent shadow-xl' : 'group-hover:shadow-lg',
                )}>
                  <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-white/10 -translate-y-6 translate-x-6" />
                  {active && <div className="absolute inset-0 bg-white/10" />}
                  <CardContent className="relative p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-1.5 rounded-lg bg-white/20">
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      {active && <ArrowUpRight className="h-3.5 w-3.5 text-white/80" />}
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-white tabular-nums leading-none">
                      {counts[key as keyof typeof counts]}
                    </p>
                    <p className="text-[10px] sm:text-xs text-white/80 mt-1 font-semibold">{label}</p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-2.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-white border border-border/60 animate-pulse" />
            ))}
          </div>
        ) : view === 'list' ? (
          <ListView bugs={filtered} page={page} onPageChange={setPage} onStatusChange={(bug, status) => updateMutation.mutate({ id: bug.id, patch: { status } })} onBugClick={openBug} />
        ) : (
          <KanbanView bugs={filtered} page={page} onPageChange={setPage} onStatusChange={(bug, status) => updateMutation.mutate({ id: bug.id, patch: { status } })} onBugClick={openBug} />
        )}
      </div>

      <NewBugDialog open={newBugOpen} onClose={() => setNewBugOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['bugs'] })} />
      <BugDetailDrawer bugId={selectedBugId} onClose={closeBug} />
      {user?.role === 'OWNER' && <BugAccessDialog open={accessOpen} onClose={() => setAccessOpen(false)} />}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────
function ListView({
  bugs, page, onPageChange, onStatusChange, onBugClick,
}: {
  bugs: Bug[]; page: number; onPageChange: (p: number) => void;
  onStatusChange: (bug: Bug, status: string) => void;
  onBugClick: (id: string) => void;
}) {
  if (bugs.length === 0) return <EmptyState />;
  const paged = paginate(bugs, page);
  return (
    <>
      <div className="space-y-2">
        {paged.map((bug) => <BugListRow key={bug.id} bug={bug} onStatusChange={onStatusChange} onClick={() => onBugClick(bug.id)} />)}
      </div>
      <Pagination total={bugs.length} page={page} onPageChange={onPageChange} />
    </>
  );
}

function BugListRow({ bug, onStatusChange, onClick }: { bug: Bug; onStatusChange: (bug: Bug, status: string) => void; onClick: () => void }) {
  const statusTokens = S[bug.status] ?? S.OPEN;
  return (
    <div className="group rounded-2xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-red-200/60 border-border/60">
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-2xl" style={{ background: statusTokens.accent }} />
        <div className="flex-1 p-3 sm:p-4">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3">
            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              <Select value={bug.status} onValueChange={(v) => onStatusChange(bug, v)}>
                <SelectTrigger className="h-7 border-0 p-0 shadow-none focus:ring-0 w-auto">
                  <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border', statusTokens.badge)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusTokens.dot)} />
                    <span className="hidden sm:inline">{STATUS_LABELS[bug.status] ?? bug.status}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', S[s]?.dot ?? 'bg-gray-300')} />
                        {STATUS_LABELS[s]}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
              <p className="font-semibold text-sm sm:text-[15px] leading-snug group-hover:text-red-700 transition-colors">
                {bug.title}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
                  {bug.team.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">Reported by {bug.reporter.name}</span>
                <span className="text-[10px] text-muted-foreground">{formatRelative(bug.createdAt)}</span>
              </div>
            </div>

            <Badge className={cn('text-[10px] font-bold border rounded-full px-2 shrink-0 hidden sm:flex', SEVERITY_STYLE[bug.severity])}>
              {bug.severity}
            </Badge>

            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {!!bug._count?.comments && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">💬 {bug._count.comments}</span>
              )}
              {!!bug._count?.attachments && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">📎 {bug._count.attachments}</span>
              )}
            </div>

            {bug.assignee ? (
              <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={onClick}>
                <Avatar className="h-7 w-7 ring-2 ring-white shadow-sm">
                  <AvatarImage src={bug.assignee.avatarUrl} />
                  <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                    {getInitials(bug.assignee.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground hidden lg:block max-w-[90px] truncate font-medium">{bug.assignee.name}</span>
              </div>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold shrink-0">Unassigned</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────
const KANBAN_COLS = ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'REOPENED', 'FIXED', 'CLOSED'];
const COL_STYLE: Record<string, { from: string; to: string; bg: string; headerBg: string }> = {
  OPEN:        { from: 'from-slate-400',  to: 'to-gray-500',   bg: 'bg-slate-50/60',  headerBg: 'bg-slate-50' },
  IN_PROGRESS: { from: 'from-blue-500',   to: 'to-indigo-600', bg: 'bg-blue-50/40',   headerBg: 'bg-blue-50' },
  IN_REVIEW:   { from: 'from-amber-500',  to: 'to-orange-600', bg: 'bg-amber-50/40',  headerBg: 'bg-amber-50' },
  REOPENED:    { from: 'from-orange-500', to: 'to-red-500',    bg: 'bg-orange-50/40', headerBg: 'bg-orange-50' },
  FIXED:       { from: 'from-emerald-500', to: 'to-green-600', bg: 'bg-emerald-50/40', headerBg: 'bg-emerald-50' },
  CLOSED:      { from: 'from-gray-400',   to: 'to-gray-500',   bg: 'bg-gray-50/60',   headerBg: 'bg-gray-50' },
};

function bugCol(bug: Bug) {
  return ['CLOSED', 'WONT_FIX', 'DUPLICATE'].includes(bug.status) ? 'CLOSED' : bug.status;
}

function KanbanView({
  bugs, page, onPageChange, onStatusChange, onBugClick,
}: {
  bugs: Bug[]; page: number; onPageChange: (p: number) => void;
  onStatusChange: (bug: Bug, status: string) => void;
  onBugClick: (id: string) => void;
}) {
  const paged = paginate(bugs, page);
  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLS.map((col) => {
          const colBugs = paged.filter((b) => bugCol(b) === col);
          const totalInCol = bugs.filter((b) => bugCol(b) === col).length;
          const cs = COL_STYLE[col];
          return (
            <div key={col} className={cn('flex-shrink-0 w-72 rounded-2xl border border-border/50 overflow-hidden', cs.bg)}>
              <div className={cn('px-4 py-3 border-b border-border/40', cs.headerBg)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('h-1.5 w-1.5 rounded-full', S[col]?.dot ?? 'bg-gray-300')} />
                    <span className="text-sm font-bold">{STATUS_LABELS[col]}</span>
                  </div>
                  <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5 border', S[col]?.badge ?? '')}>{totalInCol}</span>
                </div>
              </div>
              <div className="p-2 space-y-2 min-h-32">
                {colBugs.map((bug) => <BugKanbanCard key={bug.id} bug={bug} onStatusChange={onStatusChange} onClick={() => onBugClick(bug.id)} />)}
                {colBugs.length === 0 && (
                  <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                    <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center bg-gradient-to-br opacity-40', cs.from, cs.to)}>
                      <BugIcon className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-xs font-medium">No bugs</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Pagination total={bugs.length} page={page} onPageChange={onPageChange} />
    </>
  );
}

function BugKanbanCard({ bug, onStatusChange, onClick }: { bug: Bug; onStatusChange: (bug: Bug, status: string) => void; onClick: () => void }) {
  const nextStatus: Record<string, string> = {
    OPEN: 'IN_PROGRESS', IN_PROGRESS: 'FIXED', IN_REVIEW: 'FIXED', REOPENED: 'IN_PROGRESS', FIXED: 'CLOSED',
  };
  return (
    <div
      className="rounded-xl border bg-white overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md hover:border-red-200/60 group border-border/60"
      onClick={onClick}
    >
      <div className="h-0.5 w-full" style={{ background: S[bug.status]?.accent ?? '#94a3b8' }} />
      <div className="p-3 space-y-2.5">
        <p className="text-sm font-semibold leading-snug group-hover:text-red-700 transition-colors">{bug.title}</p>

        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold">{bug.team.name}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Badge className={cn('text-[10px] border rounded-full px-1.5', SEVERITY_STYLE[bug.severity])}>{bug.severity}</Badge>
          <div className="flex items-center gap-1.5">
            {!!bug._count?.attachments && <span className="text-[10px] text-muted-foreground">📎{bug._count.attachments}</span>}
            {bug.assignee ? (
              <Avatar className="h-6 w-6 ring-1 ring-white shadow-sm">
                <AvatarImage src={bug.assignee.avatarUrl} />
                <AvatarFallback className="text-[9px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                  {getInitials(bug.assignee.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span className="text-[9px] text-amber-700 font-semibold">Unassigned</span>
            )}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground">Reported by {bug.reporter.name} · {formatRelative(bug.createdAt)}</p>

        {nextStatus[bug.status] && (
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(bug, nextStatus[bug.status]); }}
            className="w-full text-[10px] font-semibold text-muted-foreground hover:text-red-700 border border-dashed border-border/60 hover:border-red-300 hover:bg-red-50 rounded-lg px-2 py-1.5 transition-all"
          >
            Move to {STATUS_LABELS[nextStatus[bug.status]]} →
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-24 gap-4 text-muted-foreground">
      <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 flex items-center justify-center">
        <BugIcon className="h-10 w-10 text-red-200" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground/60">No bugs found</p>
        <p className="text-sm mt-1">Try adjusting your filters, or report a new bug</p>
      </div>
    </div>
  );
}

function Pagination({ total, page, onPageChange }: { total: number; page: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-xl h-8">Previous</Button>
      <span className="text-xs text-muted-foreground font-medium">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-xl h-8">Next</Button>
    </div>
  );
}
