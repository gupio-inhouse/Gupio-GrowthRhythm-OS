import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Bug, Building2, CheckCircle2, Clock, Download, Mail,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import api from '@/api/client';
import { cn, formatDate, formatRelative, getInitials, priorityColor, statusColor } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

type ReportTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  createdAt: string;
  blockerType?: string | null;
  expectedOutcome?: string | null;
  description?: string | null;
  dependency?: { id: string; title: string; status: string } | null;
  _count: { comments: number; attachments: number };
};

type ReportBug = {
  id: string;
  title: string;
  type: string;
  status: string;
  severity: string;
  createdAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  team: { id: string; name: string };
};

const BUG_STATUS_STYLE: Record<string, string> = {
  OPEN: 'text-slate-600 bg-slate-100',
  REOPENED: 'text-orange-600 bg-orange-50',
  IN_PROGRESS: 'text-blue-600 bg-blue-50',
  IN_REVIEW: 'text-amber-700 bg-amber-50',
  FIXED: 'text-green-600 bg-green-50',
  CLOSED: 'text-gray-500 bg-gray-100',
  WONT_FIX: 'text-gray-500 bg-gray-100',
  DUPLICATE: 'text-gray-500 bg-gray-100',
};

type IndividualReportPayload = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    lastLoginAt?: string | null;
    department?: { id: string; name: string; slug: string } | null;
    manager?: { id: string; name: string; email: string } | null;
    directReports: Array<{ id: string }>;
  };
  summary: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    blockedTasks: number;
    todoTasks: number;
    cancelledTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
    completedThisWeek: number;
    completionRate: number;
  };
  priorityCounts: Record<string, number>;
  recentTasks: ReportTask[];
  bugSummary: {
    totalBugs: number;
    openBugs: number;
    inProgressBugs: number;
    inReviewBugs: number;
    resolvedBugs: number;
    resolvedThisWeek: number;
    bugResolutionRate: number;
  };
  bugSeverityCounts: Record<string, number>;
  recentBugs: ReportBug[];
};

export default function IndividualReport() {
  const { userId = '' } = useParams();
  const { user: me } = useAuthStore();
  const [isDownloading, setIsDownloading] = useState(false);

  const { data, isLoading, isError } = useQuery<IndividualReportPayload>({
    queryKey: ['individual-report', userId],
    queryFn: () => api.get(`/users/${userId}/report`).then((r) => r.data),
    enabled: !!userId,
  });

  const handleDownloadCsv = async () => {
    if (!userId) return;
    setIsDownloading(true);
    try {
      const res = await api.get(`/users/${userId}/report/export-csv`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${data?.user.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'individual'}-report.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-8 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 sm:p-8">
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="font-medium">Unable to load this individual report.</p>
            <p className="text-sm text-muted-foreground">The employee may not be visible for your role, or the report data could not be fetched.</p>
            <Button asChild variant="outline">
              <Link to={me?.role === 'TEAM_MEMBER' ? '/tasks' : '/team'}>Go back</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { user, summary, priorityCounts, recentTasks, bugSummary, bugSeverityCounts, recentBugs } = data;
  const hasBugs = bugSummary.totalBugs > 0;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="px-0">
            <Link to={me?.role === 'TEAM_MEMBER' ? '/tasks' : '/team'}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {me?.role === 'TEAM_MEMBER' ? 'Back to Tasks' : 'Back to Team'}
            </Link>
          </Button>
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{user.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="secondary">{user.role.toLowerCase().replace(/_/g, ' ')}</Badge>
                <Badge variant={user.status === 'ACTIVE' ? 'success' : user.status === 'INVITED' ? 'warning' : 'secondary'}>
                  {user.status.toLowerCase()}
                </Badge>
                {user.department && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    {user.department.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {user.email}
                </span>
                <span>Joined {formatDate(user.createdAt)}</span>
                <span>{user.lastLoginAt ? `Last active ${formatRelative(user.lastLoginAt)}` : 'No login yet'}</span>
              </div>
            </div>
          </div>
        </div>
        <Button onClick={handleDownloadCsv} disabled={isDownloading} className="gap-2">
          <Download className="h-4 w-4" />
          {isDownloading ? 'Preparing CSV...' : 'Download CSV'}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Completion', value: `${summary.completionRate}%`, sub: `${summary.completedTasks}/${summary.totalTasks} done`, icon: CheckCircle2, tone: 'text-green-600 bg-green-50' },
          { label: 'In Progress', value: summary.inProgressTasks, sub: `${summary.todoTasks} to do`, icon: Clock, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Blocked', value: summary.blockedTasks, sub: `${summary.overdueTasks} overdue`, icon: AlertTriangle, tone: 'text-red-600 bg-red-50' },
          { label: 'Due Today', value: summary.dueTodayTasks, sub: `${summary.completedThisWeek} done this week`, icon: Clock, tone: 'text-orange-600 bg-orange-50' },
        ].map(({ label, value, sub, icon: Icon, tone }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold mt-1">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                </div>
                <div className={cn('rounded-lg p-2.5', tone)}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {hasBugs && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Bug className="h-4 w-4" /> Bug Tracker Workload
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Resolution Rate', value: `${bugSummary.bugResolutionRate}%`, sub: `${bugSummary.resolvedBugs}/${bugSummary.totalBugs} resolved`, icon: CheckCircle2, tone: 'text-green-600 bg-green-50' },
              { label: 'In Progress', value: bugSummary.inProgressBugs, sub: `${bugSummary.openBugs} open`, icon: Clock, tone: 'text-blue-600 bg-blue-50' },
              { label: 'In Review', value: bugSummary.inReviewBugs, sub: 'awaiting approval', icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
              { label: 'Resolved This Week', value: bugSummary.resolvedThisWeek, sub: 'fixed / closed', icon: Bug, tone: 'text-violet-600 bg-violet-50' },
            ].map(({ label, value, sub, icon: Icon, tone }) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="text-3xl font-bold mt-1">{value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                    </div>
                    <div className={cn('rounded-lg p-2.5', tone)}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Workload Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Completion rate</span>
                <span className="font-medium">{summary.completionRate}%</span>
              </div>
              <Progress value={summary.completionRate} className="h-2" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Low', priorityCounts.LOW || 0],
                ['Medium', priorityCounts.MEDIUM || 0],
                ['High', priorityCounts.HIGH || 0],
                ['Critical', priorityCounts.CRITICAL || 0],
              ].map(([label, count]) => (
                <div key={label} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{label} priority</p>
                  <p className="text-2xl font-semibold mt-1">{count}</p>
                </div>
              ))}
            </div>

            {hasBugs && (
              <>
                <div className="flex items-center justify-between text-sm pt-2">
                  <span className="text-muted-foreground">Bug resolution rate</span>
                  <span className="font-medium">{bugSummary.bugResolutionRate}%</span>
                </div>
                <Progress value={bugSummary.bugResolutionRate} className="h-2" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Low', bugSeverityCounts.LOW || 0],
                    ['Medium', bugSeverityCounts.MEDIUM || 0],
                    ['High', bugSeverityCounts.HIGH || 0],
                    ['Critical', bugSeverityCounts.CRITICAL || 0],
                  ].map(([label, count]) => (
                    <div key={label} className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">{label} severity</p>
                      <p className="text-2xl font-semibold mt-1">{count}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reporting Line</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Manager</p>
              <p className="font-medium mt-1">{user.manager?.name || 'Not assigned'}</p>
              {user.manager?.email && (
                <p className="text-xs text-muted-foreground mt-1">{user.manager.email}</p>
              )}
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Direct reports</p>
              <p className="font-medium mt-1">{user.directReports.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="font-medium mt-1">{user.department?.name || 'Not assigned'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {recentTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{task.title}</p>
                          <Badge className={cn('border', statusColor(task.status))}>
                            {task.status.replace(/_/g, ' ')}
                          </Badge>
                          <Badge className={cn('border', priorityColor(task.priority))}>
                            {task.priority}
                          </Badge>
                        </div>
                        {(task.description || task.expectedOutcome) && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {task.expectedOutcome || task.description}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        <p>{task.dueDate ? `End ${formatDate(task.dueDate)}` : 'No end date'}</p>
                        <p className="mt-1">Created {formatDate(task.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                      {task.dependency && <span>Depends on: {task.dependency.title}</span>}
                      {task.blockerType && <span>Blocker: {task.blockerType.toLowerCase().replace(/_/g, ' ')}</span>}
                      <span>{task._count.comments} comments</span>
                      <span>{task._count.attachments} attachments</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {hasBugs && (
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1.5">
                <Bug className="h-4 w-4" /> Recent Bugs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentBugs.map((bug) => (
                  <div key={bug.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{bug.title}</p>
                          <Badge className={cn('border', BUG_STATUS_STYLE[bug.status] ?? 'text-gray-600 bg-gray-100')}>
                            {bug.status.replace(/_/g, ' ')}
                          </Badge>
                          <Badge className={cn('border', priorityColor(bug.severity))}>
                            {bug.severity}
                          </Badge>
                          {bug.type === 'ENHANCEMENT' && (
                            <Badge className="border text-violet-600 bg-violet-50">Improvement</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{bug.team.name}</p>
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        <p>Created {formatDate(bug.createdAt)}</p>
                        {(bug.closedAt || bug.resolvedAt) && (
                          <p className="mt-1">Resolved {formatDate(bug.closedAt || bug.resolvedAt!)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
