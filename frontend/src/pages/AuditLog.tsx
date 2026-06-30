import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Shield, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT' | 'INVITE' | 'REVOKE';
  after: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; role: string; avatarUrl: string | null };
}

interface AuditResponse {
  logs: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  VIEW: 'bg-gray-100 text-gray-600',
  LOGIN: 'bg-purple-100 text-purple-700',
  LOGOUT: 'bg-orange-100 text-orange-600',
  INVITE: 'bg-teal-100 text-teal-700',
  REVOKE: 'bg-red-100 text-red-700',
};

const ENTITY_LABELS: Record<string, string> = {
  Task: 'Task',
  Department: 'Department',
  User: 'User',
  Standup: 'Meeting',
  Team: 'Team',
  Feedback: 'Feedback',
};

function getEntityName(entry: AuditEntry): string {
  const data = entry.after ?? entry.before;
  if (!data) return entry.entityId;
  return (data.title ?? data.name ?? data.email ?? entry.entityId) as string;
}

function describeAction(entry: AuditEntry): string {
  const entity = ENTITY_LABELS[entry.entityType] ?? entry.entityType;
  const name = getEntityName(entry);
  switch (entry.action) {
    case 'CREATE': return `created ${entity} "${name}"`;
    case 'UPDATE': return `updated ${entity} "${name}"`;
    case 'DELETE': return `deleted ${entity} "${name}"`;
    case 'VIEW': return `viewed ${entity}`;
    case 'LOGIN': return 'logged in';
    case 'LOGOUT': return 'logged out';
    case 'INVITE': return `invited user "${name}"`;
    case 'REVOKE': return `revoked access for "${name}"`;
    default: return `performed ${entry.action} on ${entity}`;
  }
}

const ALL_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT', 'INVITE', 'REVOKE'];
const ALL_ENTITIES = ['Task', 'Department', 'User', 'Standup', 'Team'];

export default function AuditLog() {
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (filterAction) params.set('action', filterAction);
  if (filterEntity) params.set('entityType', filterEntity);
  if (filterFrom) params.set('from', filterFrom);
  if (filterTo) params.set('to', filterTo);

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ['audit-logs', page, filterAction, filterEntity, filterFrom, filterTo],
    queryFn: () => api.get(`/audit-logs?${params}`).then((r) => r.data),
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const hasActiveFilter = filterAction || filterEntity || filterFrom || filterTo;

  function clearFilters() {
    setFilterAction('');
    setFilterEntity('');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  }

  const isOwner = user?.role === 'OWNER' || user?.role === 'COMPANY_ADMIN';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              {isOwner ? 'All organization activity' : 'Your department activity'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilter && (
            <span className="h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Action</label>
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">All actions</option>
                {ALL_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select
                value={filterEntity}
                onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">All types</option>
                {ALL_ENTITIES.map((e) => (
                  <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Summary bar */}
      {data && (
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total} entries
        </p>
      )}

      {/* Log table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-48 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : !data?.logs.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Shield className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No activity found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y">
            {data.logs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  <AvatarImage src={entry.user.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {getInitials(entry.user.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{entry.user.name}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[entry.action] ?? 'bg-muted text-muted-foreground'}`}>
                      {entry.action}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">
                      {describeAction(entry)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="capitalize">{entry.user.role.toLowerCase().replace(/_/g, ' ')}</span>
                    {entry.ipAddress && (
                      <>
                        <span>·</span>
                        <span>{entry.ipAddress}</span>
                      </>
                    )}
                  </div>
                </div>

                <time className="shrink-0 text-xs text-muted-foreground mt-1 whitespace-nowrap">
                  {format(new Date(entry.createdAt), 'MMM d, yyyy · h:mm a')}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
