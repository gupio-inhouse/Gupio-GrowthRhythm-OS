import prisma from '../lib/prisma';
import { callGroq } from './ai.service';
import { BugStatus } from '@prisma/client';

// ── IST helpers ───────────────────────────────────────────────────────────────
const IST_MS = 5.5 * 3600 * 1000;

function toIST(d: Date) { return new Date(d.getTime() + IST_MS); }
function fromIST(d: Date) { return new Date(d.getTime() - IST_MS); }

function istStartOfDay(d: Date): Date {
  const ist = new Date(d); ist.setUTCHours(0, 0, 0, 0); return fromIST(ist);
}
function istEndOfDay(d: Date): Date {
  const ist = new Date(d); ist.setUTCHours(23, 59, 59, 999); return fromIST(ist);
}
function istStartOfWorkingDay(d: Date): Date {
  const ist = new Date(d); ist.setUTCHours(9, 30, 0, 0); return fromIST(ist);
}
function istEndOfWorkingDay(d: Date): Date {
  const ist = new Date(d); ist.setUTCHours(19, 30, 0, 0); return fromIST(ist);
}

export function getPeriodRange(period: 'daily' | 'weekly' | 'monthly') {
  const now = toIST(new Date());
  if (period === 'daily') return { from: istStartOfWorkingDay(now), to: istEndOfWorkingDay(now) };
  if (period === 'weekly') {
    const dow = now.getUTCDay();
    const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: istStartOfDay(monday), to: istEndOfDay(sunday) };
  }
  const first = new Date(now); first.setUTCDate(1);
  const last = new Date(now); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  return { from: istStartOfDay(first), to: istEndOfDay(last) };
}

function getPriorPeriodRange(period: 'daily' | 'weekly' | 'monthly', currentFrom: Date) {
  const istFrom = toIST(currentFrom);
  if (period === 'daily') {
    const prev = new Date(istFrom); prev.setUTCDate(istFrom.getUTCDate() - 1);
    return { from: istStartOfWorkingDay(prev), to: istEndOfWorkingDay(prev) };
  }
  if (period === 'weekly') {
    const prevMon = new Date(istFrom); prevMon.setUTCDate(istFrom.getUTCDate() - 7);
    const prevSun = new Date(prevMon); prevSun.setUTCDate(prevMon.getUTCDate() + 6);
    return { from: istStartOfDay(prevMon), to: istEndOfDay(prevSun) };
  }
  const lastOfPrev = new Date(istFrom); lastOfPrev.setUTCDate(0);
  const firstOfPrev = new Date(lastOfPrev); firstOfPrev.setUTCDate(1);
  return { from: istStartOfDay(firstOfPrev), to: istEndOfDay(lastOfPrev) };
}

export function isLastDayOfMonthIST(): boolean {
  const now = toIST(new Date());
  const tomorrow = new Date(now); tomorrow.setUTCDate(now.getUTCDate() + 1);
  return tomorrow.getUTCMonth() !== now.getUTCMonth();
}

// ── Types ──────────────────────────────────────────────────────────────────────
export type TaskInfo = {
  id: string; title: string; status: string; priority: string;
  dueDate: Date | null; completedAt: Date | null; completionSubmittedAt: Date | null;
  teamName: string | null; doneInPeriod: boolean;
  daysLate: number | null; overdueDays: number | null;
};

export type BugInfo = {
  id: string; title: string; type: string; status: string; severity: string;
  teamName: string | null; resolvedAt: Date | null;
};

export type MemberReport = {
  userId: string; name: string; role: string;
  doneTasks: TaskInfo[];
  reviewPendingTasks: TaskInfo[]; // IN_REVIEW + submitted on time — reviewer delay
  pendingTasks: TaskInfo[];       // due in period, not submitted
  overdueTasks: TaskInfo[];       // due before period, not submitted
  doneCount: number; onTimeCount: number; lateCount: number;
  reviewPendingCount: number; pendingCount: number; overdueCount: number;
  doneDelta: number | null;
  onTimeDelta: number | null;
  // Bug Tracker — Engineering only in practice, empty for everyone else.
  resolvedBugs: BugInfo[];   // resolved (fixed/closed/won't-fix/duplicate) in this period
  inReviewBugs: BugInfo[];   // currently awaiting fix review
  openBugs: BugInfo[];       // currently open/in-progress, unresolved
  bugResolvedCount: number; bugInReviewCount: number; bugOpenCount: number;
  bugResolvedDelta: number | null;
};

export type DeptReport = {
  deptId: string; deptName: string; headName: string | null; headEmail: string | null;
  members: MemberReport[];
  totalDone: number; totalOnTime: number; totalLate: number;
  totalReviewPending: number; totalPending: number; totalOverdue: number;
  doneDelta: number | null; onTimeDelta: number | null;
  totalBugResolved: number; totalBugInReview: number; totalBugOpen: number;
  bugResolvedDelta: number | null;
};

export type OrgReport = {
  orgId: string; orgName: string; period: 'daily' | 'weekly' | 'monthly';
  from: Date; to: Date; departments: DeptReport[];
  totalDone: number; totalOnTime: number; totalLate: number;
  totalReviewPending: number; totalPending: number; totalOverdue: number;
  totalBugResolved: number; totalBugInReview: number; totalBugOpen: number;
  aiSummary?: string;
};

const RESOLVED_BUG_STATUSES: BugStatus[] = ['FIXED', 'CLOSED', 'WONT_FIX', 'DUPLICATE'];

// ── Prior-period stats for delta ───────────────────────────────────────────────
async function buildPriorStats(
  orgId: string,
  period: 'daily' | 'weekly' | 'monthly',
  currentFrom: Date,
): Promise<Map<string, { doneCount: number; onTimeCount: number; bugResolvedCount: number }>> {
  const prior = getPriorPeriodRange(period, currentFrom);
  const [tasks, bugs] = await Promise.all([
    prisma.task.findMany({
      where: { orgId, status: 'DONE', completedAt: { gte: prior.from, lte: prior.to }, assigneeUserId: { not: null } },
      select: { assigneeUserId: true, dueDate: true, completedAt: true, completionSubmittedAt: true },
    }),
    prisma.bug.findMany({
      where: {
        orgId, assigneeUserId: { not: null }, status: { in: RESOLVED_BUG_STATUSES },
        OR: [{ closedAt: { gte: prior.from, lte: prior.to } }, { resolvedAt: { gte: prior.from, lte: prior.to } }],
      },
      select: { assigneeUserId: true },
    }),
  ]);
  const map = new Map<string, { doneCount: number; onTimeCount: number; bugResolvedCount: number }>();
  for (const t of tasks) {
    if (!t.assigneeUserId || !t.completedAt) continue;
    const s = map.get(t.assigneeUserId) ?? { doneCount: 0, onTimeCount: 0, bugResolvedCount: 0 };
    s.doneCount++;
    if (t.dueDate) {
      const submitted = t.completionSubmittedAt ?? t.completedAt;
      if (submitted <= t.dueDate) s.onTimeCount++;
    }
    map.set(t.assigneeUserId, s);
  }
  for (const b of bugs) {
    if (!b.assigneeUserId) continue;
    const s = map.get(b.assigneeUserId) ?? { doneCount: 0, onTimeCount: 0, bugResolvedCount: 0 };
    s.bugResolvedCount++;
    map.set(b.assigneeUserId, s);
  }
  return map;
}

// ── Data builder ───────────────────────────────────────────────────────────────
export async function buildOrgReport(
  orgId: string,
  period: 'daily' | 'weekly' | 'monthly',
): Promise<OrgReport> {
  const { from, to } = getPeriodRange(period);
  const now = new Date();

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId }, select: { id: true, name: true },
  });

  const departments = await prisma.department.findMany({
    where: { orgId, isActive: true },
    orderBy: { name: 'asc' },
    include: {
      head: { select: { id: true, name: true, email: true } },
      users: {
        where: { status: 'ACTIVE', role: { notIn: ['OWNER', 'COMPANY_ADMIN'] } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: true, email: true },
      },
    },
  });

  const tasks = await prisma.task.findMany({
    where: {
      orgId, assigneeUserId: { not: null },
      OR: [
        { status: 'DONE', completedAt: { gte: from, lte: to } },
        { status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lte: to } },
      ],
    },
    select: {
      id: true, title: true, status: true, priority: true,
      dueDate: true, completedAt: true, completionSubmittedAt: true,
      assigneeUserId: true, departmentId: true,
      team: { select: { name: true } },
    },
  });

  const bugs = await prisma.bug.findMany({
    where: {
      orgId, assigneeUserId: { not: null },
      OR: [
        { status: { in: RESOLVED_BUG_STATUSES }, OR: [{ closedAt: { gte: from, lte: to } }, { resolvedAt: { gte: from, lte: to } }] },
        { status: { notIn: RESOLVED_BUG_STATUSES } },
      ],
    },
    select: {
      id: true, title: true, type: true, status: true, severity: true,
      resolvedAt: true, closedAt: true, assigneeUserId: true,
      team: { select: { name: true } },
    },
  });

  const priorStats = await buildPriorStats(orgId, period, from);

  const tasksByUser = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.assigneeUserId) continue;
    if (!tasksByUser.has(t.assigneeUserId)) tasksByUser.set(t.assigneeUserId, []);
    tasksByUser.get(t.assigneeUserId)!.push(t);
  }

  const bugsByUser = new Map<string, typeof bugs>();
  for (const b of bugs) {
    if (!b.assigneeUserId) continue;
    if (!bugsByUser.has(b.assigneeUserId)) bugsByUser.set(b.assigneeUserId, []);
    bugsByUser.get(b.assigneeUserId)!.push(b);
  }

  const deptReports: DeptReport[] = [];

  for (const dept of departments) {
    if (dept.users.length === 0) continue;
    const memberReports: MemberReport[] = [];

    for (const user of dept.users) {
      const userTasks = tasksByUser.get(user.id) ?? [];
      const doneTasks: TaskInfo[] = [];
      const reviewPendingTasks: TaskInfo[] = [];
      const pendingTasks: TaskInfo[] = [];
      const overdueTasks: TaskInfo[] = [];

      for (const t of userTasks) {
        const isTaskDone = t.status === 'DONE' && t.completedAt && t.completedAt >= from && t.completedAt <= to;

        if (isTaskDone && t.completedAt) {
          let daysLate: number | null = null;
          if (t.dueDate) {
            const submitted = t.completionSubmittedAt ?? t.completedAt;
            const diff = Math.floor((submitted.getTime() - t.dueDate.getTime()) / 86400000);
            daysLate = diff > 0 ? diff : null;
          }
          doneTasks.push({
            id: t.id, title: t.title, status: t.status, priority: t.priority,
            dueDate: t.dueDate, completedAt: t.completedAt,
            completionSubmittedAt: t.completionSubmittedAt,
            teamName: t.team?.name ?? null, doneInPeriod: true, daysLate, overdueDays: null,
          });
        } else if (t.status !== 'DONE' && t.status !== 'CANCELLED' && t.dueDate) {
          // Any IN_REVIEW task with completionSubmittedAt set = member submitted; awaiting reviewer
          const isInReviewSubmitted = t.status === 'IN_REVIEW' && t.completionSubmittedAt !== null;

          if (isInReviewSubmitted) {
            const diff = Math.floor((t.completionSubmittedAt!.getTime() - t.dueDate.getTime()) / 86400000);
            reviewPendingTasks.push({
              id: t.id, title: t.title, status: t.status, priority: t.priority,
              dueDate: t.dueDate, completedAt: null, completionSubmittedAt: t.completionSubmittedAt,
              teamName: t.team?.name ?? null, doneInPeriod: false,
              daysLate: diff > 0 ? diff : null, // null = on time, >0 = submitted late
              overdueDays: null,
            });
          } else {
            const overdueDays = Math.floor((now.getTime() - t.dueDate.getTime()) / 86400000);
            const info: TaskInfo = {
              id: t.id, title: t.title, status: t.status, priority: t.priority,
              dueDate: t.dueDate, completedAt: null, completionSubmittedAt: t.completionSubmittedAt,
              teamName: t.team?.name ?? null, doneInPeriod: false, daysLate: null,
              overdueDays: overdueDays > 0 ? overdueDays : null,
            };
            if (t.dueDate < from) overdueTasks.push(info);
            else pendingTasks.push(info);
          }
        }
      }

      doneTasks.sort((a, b) => (b.daysLate ?? -1) - (a.daysLate ?? -1));
      reviewPendingTasks.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
      pendingTasks.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
      overdueTasks.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));

      const onTimeCount = doneTasks.filter((t) => t.daysLate === null).length;
      const lateCount = doneTasks.filter((t) => t.daysLate !== null).length;
      const prior = priorStats.get(user.id);

      const userBugs = bugsByUser.get(user.id) ?? [];
      const resolvedBugs: BugInfo[] = [];
      const inReviewBugs: BugInfo[] = [];
      const openBugs: BugInfo[] = [];

      for (const b of userBugs) {
        const resolvedAt = b.closedAt ?? b.resolvedAt;
        const isResolvedInPeriod = RESOLVED_BUG_STATUSES.includes(b.status)
          && resolvedAt && resolvedAt >= from && resolvedAt <= to;

        const info: BugInfo = {
          id: b.id, title: b.title, type: b.type, status: b.status, severity: b.severity,
          teamName: b.team?.name ?? null, resolvedAt: resolvedAt ?? null,
        };

        if (isResolvedInPeriod) resolvedBugs.push(info);
        else if (b.status === 'IN_REVIEW') inReviewBugs.push(info);
        else if (!RESOLVED_BUG_STATUSES.includes(b.status)) openBugs.push(info);
      }

      resolvedBugs.sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));

      memberReports.push({
        userId: user.id, name: user.name, role: user.role,
        doneTasks, reviewPendingTasks, pendingTasks, overdueTasks,
        doneCount: doneTasks.length, onTimeCount, lateCount,
        reviewPendingCount: reviewPendingTasks.length,
        pendingCount: pendingTasks.length, overdueCount: overdueTasks.length,
        doneDelta: prior != null ? doneTasks.length - prior.doneCount : null,
        onTimeDelta: prior != null ? onTimeCount - prior.onTimeCount : null,
        resolvedBugs, inReviewBugs, openBugs,
        bugResolvedCount: resolvedBugs.length, bugInReviewCount: inReviewBugs.length, bugOpenCount: openBugs.length,
        bugResolvedDelta: prior != null ? resolvedBugs.length - prior.bugResolvedCount : null,
      });
    }

    const totalDone = memberReports.reduce((s, m) => s + m.doneCount, 0);
    const totalOnTime = memberReports.reduce((s, m) => s + m.onTimeCount, 0);
    const totalLate = memberReports.reduce((s, m) => s + m.lateCount, 0);
    const totalReviewPending = memberReports.reduce((s, m) => s + m.reviewPendingCount, 0);
    const totalPending = memberReports.reduce((s, m) => s + m.pendingCount, 0);
    const totalOverdue = memberReports.reduce((s, m) => s + m.overdueCount, 0);
    const doneDelta = memberReports.some((m) => m.doneDelta !== null)
      ? memberReports.reduce((s, m) => s + (m.doneDelta ?? 0), 0) : null;
    const onTimeDelta = memberReports.some((m) => m.onTimeDelta !== null)
      ? memberReports.reduce((s, m) => s + (m.onTimeDelta ?? 0), 0) : null;
    const totalBugResolved = memberReports.reduce((s, m) => s + m.bugResolvedCount, 0);
    const totalBugInReview = memberReports.reduce((s, m) => s + m.bugInReviewCount, 0);
    const totalBugOpen = memberReports.reduce((s, m) => s + m.bugOpenCount, 0);
    const bugResolvedDelta = memberReports.some((m) => m.bugResolvedDelta !== null)
      ? memberReports.reduce((s, m) => s + (m.bugResolvedDelta ?? 0), 0) : null;

    deptReports.push({
      deptId: dept.id, deptName: dept.name,
      headName: dept.head?.name ?? null, headEmail: dept.head?.email ?? null,
      members: memberReports,
      totalDone, totalOnTime, totalLate, totalReviewPending, totalPending, totalOverdue,
      doneDelta, onTimeDelta,
      totalBugResolved, totalBugInReview, totalBugOpen, bugResolvedDelta,
    });
  }

  const reportData = {
    orgId, orgName: org.name, period, from, to,
    departments: deptReports,
    totalDone: deptReports.reduce((s, d) => s + d.totalDone, 0),
    totalOnTime: deptReports.reduce((s, d) => s + d.totalOnTime, 0),
    totalLate: deptReports.reduce((s, d) => s + d.totalLate, 0),
    totalReviewPending: deptReports.reduce((s, d) => s + d.totalReviewPending, 0),
    totalPending: deptReports.reduce((s, d) => s + d.totalPending, 0),
    totalOverdue: deptReports.reduce((s, d) => s + d.totalOverdue, 0),
    totalBugResolved: deptReports.reduce((s, d) => s + d.totalBugResolved, 0),
    totalBugInReview: deptReports.reduce((s, d) => s + d.totalBugInReview, 0),
    totalBugOpen: deptReports.reduce((s, d) => s + d.totalBugOpen, 0),
  };

  const aiSummary = await getAiPerformanceSummary(reportData, period);
  return { ...reportData, aiSummary };
}

async function getAiPerformanceSummary(report: Omit<OrgReport, 'aiSummary'>, period: 'daily' | 'weekly' | 'monthly'): Promise<string> {
  const membersData = report.departments.flatMap((d) =>
    d.members.map((m) => ({
      id: m.userId,
      name: m.name,
      role: m.role,
      department: d.deptName,
      completed: m.doneTasks.map((t) => `${t.title} (${t.daysLate ? `${t.daysLate}d late` : 'on time'})`),
      inReview: m.reviewPendingTasks.map((t) => t.title),
      pending: m.pendingTasks.map((t) => t.title),
      overdue: m.overdueTasks.map((t) => `${t.title} (${t.overdueDays}d overdue)`),
      bugsResolved: m.resolvedBugs.map((b) => b.title),
      bugsOpen: m.openBugs.map((b) => `${b.title} (${b.severity})`),
    }))
  );

  const activeMembers = membersData.filter(
    (m) => m.completed.length > 0 || m.inReview.length > 0 || m.pending.length > 0 || m.overdue.length > 0
      || m.bugsResolved.length > 0 || m.bugsOpen.length > 0
  );

  if (activeMembers.length === 0) return `No member activity this ${period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}.`;

  const periodWord = period === 'daily' ? 'today' : period === 'weekly' ? 'this week' : 'this month';

  const prompt = `You are a professional business coach. Analyze the performance data of the following team members for ${periodWord} and generate an extremely concise, 1-sentence summary (max 15-20 words) for each member. Focus on their progress, wins, or key blockers — for Engineering members, factor in bug-fixing work (bugsResolved/bugsOpen) alongside tasks, not tasks alone. Be direct, professional, and action-oriented.
   
Return ONLY a valid JSON object mapping each user's ID to their summary string (no markdown block wrappers, no other text), for example:
{
  "userId": "Completed database migration on time; has 2 overdue API tasks to address."
}

Members data:
${JSON.stringify(activeMembers, null, 2)}
`;

  try {
    const text = await callGroq(prompt, 'You are an AI assistant analyzing team performance reports.');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return '';
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;

    let html = '<ul style="margin:0;padding-left:20px;list-style-type:disc;color:#cbd5e1;font-size:12px;line-height:1.6;">';
    for (const member of activeMembers) {
      const summary = parsed[member.id] || 'No updates for this period.';
      html += `<li style="margin-bottom:8px;"><strong style="color:#ffffff;">${member.name}</strong>: ${summary}</li>`;
    }
    html += '</ul>';
    return html;
  } catch (e) {
    console.error('Error generating AI report summary:', e);
    return '';
  }
}

// ── Shared formatters ──────────────────────────────────────────────────────────
function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function fmtPeriodLabel(period: 'daily' | 'weekly' | 'monthly', from: Date, to: Date): string {
  if (period === 'daily') return fmtDate(from);
  if (period === 'weekly') return `${fmtDate(from)} – ${fmtDate(to)}`;
  return from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

const ROLE_LABEL: Record<string, string> = {
  DEPARTMENT_HEAD: 'Dept Head', MANAGER: 'Manager',
  TEAM_MEMBER: 'Team Member', COACH_ADVISOR: 'Advisor',
};
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#22c55e',
};
const STATUS_LABEL: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review',
  BLOCKED: 'Blocked', CANCELLED: 'Cancelled', DONE: 'Done',
};
const STATUS_COLOR: Record<string, string> = {
  TODO: '#64748b', IN_PROGRESS: '#3b82f6', IN_REVIEW: '#8b5cf6',
  BLOCKED: '#ef4444', DONE: '#22c55e', CANCELLED: '#94a3b8',
};
const BUG_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review', REOPENED: 'Reopened',
  FIXED: 'Fixed', CLOSED: 'Closed', WONT_FIX: "Won't Fix", DUPLICATE: 'Duplicate',
};

// ── HTML renderer ──────────────────────────────────────────────────────────────
export function renderReportHtml(
  report: OrgReport,
  recipientRole: 'OWNER' | 'DEPT_HEAD',
  recipientName: string,
  filterDeptIds?: string[],
  appUrl = 'https://app.growthrhythm.in',
): string {
  const firstName = recipientName.split(' ')[0];
  const periodLabel = fmtPeriodLabel(report.period, report.from, report.to);
  const reportTitle = report.period === 'daily' ? 'Daily Report' :
    report.period === 'weekly' ? 'Weekly Report' : 'Monthly Report';
  const periodWord = report.period === 'daily' ? 'day' : report.period === 'weekly' ? 'week' : 'month';

  const depts = filterDeptIds
    ? report.departments.filter((d) => filterDeptIds.includes(d.deptId))
    : report.departments;

  const grandStats = filterDeptIds
    ? {
        totalDone:           depts.reduce((s, d) => s + d.totalDone, 0),
        totalOnTime:         depts.reduce((s, d) => s + d.totalOnTime, 0),
        totalLate:           depts.reduce((s, d) => s + d.totalLate, 0),
        totalReviewPending:  depts.reduce((s, d) => s + d.totalReviewPending, 0),
        totalPending:        depts.reduce((s, d) => s + d.totalPending, 0),
        totalOverdue:        depts.reduce((s, d) => s + d.totalOverdue, 0),
        totalBugResolved:    depts.reduce((s, d) => s + d.totalBugResolved, 0),
        totalBugInReview:    depts.reduce((s, d) => s + d.totalBugInReview, 0),
        totalBugOpen:        depts.reduce((s, d) => s + d.totalBugOpen, 0),
      }
    : report;

  // ── 9. Preheader text ──────────────────────────────────────────────────────
  const preheader = `${grandStats.totalDone} done · ${grandStats.totalOnTime} on time · ${grandStats.totalOverdue} overdue — ${report.orgName} ${reportTitle}`;

  // ── 3. Delta indicator ─────────────────────────────────────────────────────
  function delta(d: number | null, invert = false): string {
    if (d === null || d === 0) return '';
    const up = invert ? d < 0 : d > 0;
    const color = up ? '#22c55e' : '#ef4444';
    const arrow = d > 0 ? '&#8593;' : '&#8595;';
    return `<span style="font-size:10px;font-weight:700;color:${color};margin-left:3px;">${arrow}${Math.abs(d)}</span>`;
  }

  // ── Stat pill ──────────────────────────────────────────────────────────────
  function statPill(value: number, label: string, color: string, d: number | null = null, invert = false): string {
    return `<td style="padding:0 6px 0 0;white-space:nowrap;">
      <div style="display:inline-block;background-color:${color}18;border:1px solid ${color}30;border-radius:8px;padding:5px 10px;text-align:center;min-width:44px;">
        <p style="margin:0;font-size:17px;font-weight:700;color:${color};">${value}${delta(d, invert)}</p>
        <p style="margin:0;font-size:10px;color:#94a3b8;font-weight:500;">${label}</p>
      </div>
    </td>`;
  }

  // ── 1. Inline bar chart per member ─────────────────────────────────────────
  function inlineBar(onTimeCount: number, lateCount: number, totalDone: number): string {
    if (totalDone === 0) return '';
    const onTimePct = Math.round((onTimeCount / totalDone) * 100);
    const latePct = 100 - onTimePct;
    return `
    <table cellpadding="0" cellspacing="0" style="margin-top:9px;width:100%;max-width:300px;">
      <tr>
        <td style="font-size:10px;color:#94a3b8;padding-bottom:3px;" colspan="2">
          <span style="color:#22c55e;font-weight:600;">${onTimeCount} on time</span>
          ${lateCount > 0 ? `&nbsp;&nbsp;<span style="color:#ef4444;font-weight:600;">${lateCount} late</span>` : ''}
        </td>
      </tr>
      <tr>
        ${onTimePct > 0 ? `<td style="width:${onTimePct}%;background-color:#22c55e;height:6px;border-radius:${latePct === 0 ? '4px' : '4px 0 0 4px'};"></td>` : ''}
        ${latePct > 0 ? `<td style="background-color:#ef4444;height:6px;border-radius:${onTimePct === 0 ? '4px' : '0 4px 4px 0'};"></td>` : ''}
      </tr>
    </table>`;
  }

  // ── Task row ───────────────────────────────────────────────────────────────
  function taskRow(t: TaskInfo, type: 'done' | 'pending' | 'overdue' | 'review-pending'): string {
    const pc = PRIORITY_COLOR[t.priority] ?? '#94a3b8';
    const badge = type === 'done'
      ? t.daysLate === null
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#22c55e20;color:#22c55e;border:1px solid #22c55e30;">&#10003; On Time</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#ef444420;color:#ef4444;border:1px solid #ef444430;">${t.daysLate}d late</span>`
      : type === 'review-pending'
        ? t.daysLate === null
          ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#8b5cf620;color:#a78bfa;border:1px solid #8b5cf640;">&#9203; Submitted On Time — Awaiting Review</span>`
          : `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#f9731620;color:#fb923c;border:1px solid #f9731640;">&#9203; Submitted ${t.daysLate}d Late — In Review</span>`
      : type === 'overdue'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#ef444420;color:#ef4444;border:1px solid #ef444430;">&#9888; ${t.overdueDays}d overdue</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:${STATUS_COLOR[t.status] ?? '#64748b'}20;color:${STATUS_COLOR[t.status] ?? '#64748b'};border:1px solid ${STATUS_COLOR[t.status] ?? '#64748b'}30;">${STATUS_LABEL[t.status] ?? t.status}</span>`;

    const dueLine = t.dueDate ? `<span style="font-size:10px;color:#64748b;margin-left:6px;">Due: ${fmtDate(t.dueDate)}</span>` : '';
    const projectBadge = t.teamName
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#2563eb22;color:#60a5fa;border:1px solid #2563eb40;margin-right:6px;">&#128193; ${t.teamName}</span>`
      : `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:600;background-color:#47556920;color:#64748b;border:1px solid #47556940;margin-right:6px;">&#128203; Individual</span>`;

    return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:4px;background-color:${pc};border-radius:2px;">&nbsp;</td>
          <td style="padding-left:10px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#e2e8f0;">${t.title}</p>
            <div>${projectBadge}${badge}${dueLine}</div>
          </td>
        </tr></table>
      </td>
    </tr>`;
  }

  // ── Bug row (severity reuses the same LOW/MEDIUM/HIGH/CRITICAL palette as task priority) ──
  function bugRow(b: BugInfo, type: 'resolved' | 'in-review' | 'open'): string {
    const sc = PRIORITY_COLOR[b.severity] ?? '#94a3b8';
    const badge = type === 'resolved'
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#22c55e20;color:#22c55e;border:1px solid #22c55e30;">&#10003; ${BUG_STATUS_LABEL[b.status] ?? b.status}</span>`
      : type === 'in-review'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#8b5cf620;color:#a78bfa;border:1px solid #8b5cf640;">&#9203; In Review</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#06b6d420;color:#22d3ee;border:1px solid #06b6d430;">${b.status === 'IN_PROGRESS' ? 'In Progress' : b.status === 'REOPENED' ? 'Reopened' : 'Open'}</span>`;

    const typeBadge = b.type === 'ENHANCEMENT'
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:600;background-color:#8b5cf620;color:#a78bfa;border:1px solid #8b5cf640;margin-right:6px;">Improvement</span>`
      : '';
    const projectBadge = b.teamName
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#2563eb22;color:#60a5fa;border:1px solid #2563eb40;margin-right:6px;">&#128193; ${b.teamName}</span>`
      : '';

    return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:4px;background-color:${sc};border-radius:2px;">&nbsp;</td>
          <td style="padding-left:10px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#e2e8f0;">${b.title}</p>
            <div>${projectBadge}${typeBadge}${badge}</div>
          </td>
        </tr></table>
      </td>
    </tr>`;
  }

  // ── Member card ────────────────────────────────────────────────────────────
  function memberCard(m: MemberReport): string {
    const hasBugActivity = m.bugResolvedCount > 0 || m.bugInReviewCount > 0 || m.bugOpenCount > 0;

    // 8. Zero-activity — compact visible row
    if (m.doneCount === 0 && m.reviewPendingCount === 0 && m.pendingCount === 0 && m.overdueCount === 0 && !hasBugActivity) {
      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;background-color:#1e293b;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:10px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <p style="margin:0;font-size:13px;font-weight:600;color:#94a3b8;">${m.name}</p>
              <p style="margin:1px 0 0;font-size:10px;color:#475569;">${ROLE_LABEL[m.role] ?? m.role}</p>
            </td>
            <td align="right">
              <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background-color:#0f172a;color:#475569;border:1px solid rgba(255,255,255,0.1);">
                0 done &nbsp;&bull;&nbsp; 0 overdue
              </span>
            </td>
          </tr></table>
        </td></tr>
      </table>`;
    }

    const onTimePct = m.doneCount > 0 ? Math.round((m.onTimeCount / m.doneCount) * 100) : 0;
    const barColor = onTimePct >= 80 ? '#22c55e' : onTimePct >= 50 ? '#f59e0b' : '#ef4444';

    const doneRows = m.doneTasks.length > 0
      ? m.doneTasks.map((t) => taskRow(t, 'done')).join('')
      : `<tr><td style="padding:8px 0;font-size:12px;color:#475569;font-style:italic;">No tasks completed this period.</td></tr>`;

    const reviewPendingSection = m.reviewPendingTasks.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#a78bfa;letter-spacing:0.5px;">&#9203; IN REVIEW — AWAITING APPROVAL (${m.reviewPendingTasks.length})</p>
        </td></tr>
        ${m.reviewPendingTasks.map((t) => taskRow(t, 'review-pending')).join('')}` : '';

    const pendingSection = m.pendingTasks.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#f59e0b;letter-spacing:0.5px;">DUE THIS PERIOD — NOT SUBMITTED (${m.pendingTasks.length})</p>
        </td></tr>
        ${m.pendingTasks.map((t) => taskRow(t, 'pending')).join('')}` : '';

    const overdueSection = m.overdueTasks.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.5px;">OVERDUE — NOT SUBMITTED (${m.overdueTasks.length})</p>
        </td></tr>
        ${m.overdueTasks.map((t) => taskRow(t, 'overdue')).join('')}` : '';

    // Bug Tracker sections — Engineering only in practice, omitted entirely when empty.
    const bugResolvedSection = m.resolvedBugs.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#06b6d4;letter-spacing:0.5px;">&#128027; BUGS RESOLVED (${m.resolvedBugs.length})</p>
        </td></tr>
        ${m.resolvedBugs.map((b) => bugRow(b, 'resolved')).join('')}` : '';

    const bugInReviewSection = m.inReviewBugs.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#a78bfa;letter-spacing:0.5px;">&#9203; BUGS IN REVIEW (${m.inReviewBugs.length})</p>
        </td></tr>
        ${m.inReviewBugs.map((b) => bugRow(b, 'in-review')).join('')}` : '';

    const bugOpenSection = m.openBugs.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#22d3ee;letter-spacing:0.5px;">BUGS OPEN / IN PROGRESS (${m.openBugs.length})</p>
        </td></tr>
        ${m.openBugs.map((b) => bugRow(b, 'open')).join('')}` : '';

    // 6. CTA link
    const ctaLink = (m.overdueCount > 0 || m.pendingCount > 0)
      ? `<tr><td style="padding-top:10px;text-align:right;">
          <a href="${appUrl}/tasks" style="display:inline-block;padding:6px 14px;background-color:#1e3a5f;border:1px solid #2563eb40;border-radius:8px;font-size:11px;font-weight:600;color:#60a5fa;text-decoration:none;">
            View ${m.overdueCount + m.pendingCount} Pending Tasks &#8594;
          </a>
        </td></tr>` : '';

    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;background-color:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.07);">
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <p style="margin:0;font-size:14px;font-weight:700;color:#f1f5f9;">${m.name}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">${ROLE_LABEL[m.role] ?? m.role}</p>
              <!-- 1. Inline bar chart -->
              ${inlineBar(m.onTimeCount, m.lateCount, m.doneCount)}
            </td>
            <td align="right" style="vertical-align:top;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">On-time rate</p>
              <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${barColor};">${onTimePct}%</p>
            </td>
          </tr></table>
          <!-- 3. Delta stat pills -->
          <table cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>
            ${statPill(m.doneCount, 'Done', '#22c55e', m.doneDelta)}
            ${statPill(m.onTimeCount, 'On Time', '#3b82f6', m.onTimeDelta)}
            ${statPill(m.lateCount, 'Late', '#f97316')}
            ${m.reviewPendingCount > 0 ? statPill(m.reviewPendingCount, 'In Review', '#8b5cf6') : ''}
            ${statPill(m.pendingCount, 'Pending', '#f59e0b')}
            ${statPill(m.overdueCount, 'Overdue', '#ef4444')}
            ${hasBugActivity ? statPill(m.bugResolvedCount, 'Bugs Fixed', '#06b6d4', m.bugResolvedDelta) : ''}
            ${m.bugInReviewCount > 0 ? statPill(m.bugInReviewCount, 'Bugs In Review', '#8b5cf6') : ''}
            ${m.bugOpenCount > 0 ? statPill(m.bugOpenCount, 'Bugs Open', '#22d3ee') : ''}
          </tr></table>
        </td>
      </tr>
      <tr><td style="padding:12px 18px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 6px;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#22c55e;letter-spacing:0.5px;">COMPLETED (${m.doneTasks.length})</p>
          </td></tr>
          ${doneRows}
          ${reviewPendingSection}
          ${pendingSection}
          ${overdueSection}
          ${bugResolvedSection}
          ${bugInReviewSection}
          ${bugOpenSection}
          ${ctaLink}
        </table>
      </td></tr>
    </table>`;
  }

  // ── Department section ─────────────────────────────────────────────────────
  function deptSection(d: DeptReport): string {
    const total = d.totalDone + d.totalReviewPending + d.totalPending + d.totalOverdue;
    const completionPct = total > 0 ? Math.round((d.totalDone / total) * 100) : 0;

    // 4. Critical / High overdue callout
    const criticalTasks = d.members.flatMap((m) =>
      m.overdueTasks
        .filter((t) => t.priority === 'CRITICAL' || t.priority === 'HIGH')
        .map((t) => ({ ...t, memberName: m.name }))
    );
    const criticalCallout = criticalTasks.length > 0 ? `
    <tr><td style="padding:12px 16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a0505;border:1px solid #ef444450;border-radius:10px;">
        <tr><td style="padding:12px 16px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.5px;">
            &#9888; CRITICAL / HIGH PRIORITY OVERDUE — IMMEDIATE ATTENTION (${criticalTasks.length})
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${criticalTasks.map((t) => `
            <tr><td style="padding:4px 0;border-bottom:1px solid rgba(239,68,68,0.1);">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="width:4px;background-color:${PRIORITY_COLOR[t.priority]};border-radius:2px;">&nbsp;</td>
                <td style="padding-left:10px;">
                  <p style="margin:0;font-size:12px;font-weight:600;color:#fca5a5;">${t.title}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#94a3b8;">
                    ${t.memberName} &bull; ${t.overdueDays}d overdue &bull; Due: ${fmtDate(t.dueDate)}
                    ${t.teamName ? ` &bull; &#128193; ${t.teamName}` : ''}
                  </p>
                </td>
              </tr></table>
            </td></tr>`).join('')}
          </table>
        </td></tr>
      </table>
    </td></tr>` : '';

    return `
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">

        <!-- 2. Dept header with completion bar -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f,#1e293b);border-radius:12px 12px 0 0;padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">&#127970; ${d.deptName}</p>
              ${d.headName ? `<p style="margin:3px 0 0;font-size:12px;color:#93c5fd;">Head: ${d.headName}</p>` : ''}
            </td>
            <td align="right" style="vertical-align:top;">
              <p style="margin:0;font-size:11px;color:#93c5fd;">Completion${delta(d.doneDelta)}</p>
              <p style="margin:2px 0 0;font-size:22px;font-weight:800;color:#60a5fa;">${completionPct}%</p>
            </td>
          </tr></table>
          <!-- 2. Segmented completion bar -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
            <tr>
              ${completionPct > 0 ? `<td style="width:${completionPct}%;background-color:#22c55e;height:4px;border-radius:${completionPct === 100 ? '4px' : '4px 0 0 4px'};"></td>` : ''}
              ${completionPct < 100 ? `<td style="background-color:rgba(255,255,255,0.1);height:4px;border-radius:${completionPct === 0 ? '4px' : '0 4px 4px 0'};"></td>` : ''}
            </tr>
          </table>
        </td></tr>

        <!-- Dept stats bar -->
        <tr><td style="background-color:#172033;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <table cellpadding="0" cellspacing="0"><tr>
            ${statPill(d.totalDone, 'Done', '#22c55e', d.doneDelta)}
            ${statPill(d.totalOnTime, 'On Time', '#3b82f6', d.onTimeDelta)}
            ${statPill(d.totalLate, 'Late', '#f97316')}
            ${d.totalReviewPending > 0 ? statPill(d.totalReviewPending, 'In Review', '#8b5cf6') : ''}
            ${statPill(d.totalPending, 'Pending', '#f59e0b')}
            ${statPill(d.totalOverdue, 'Overdue', '#ef4444')}
            ${d.totalBugResolved + d.totalBugInReview + d.totalBugOpen > 0 ? statPill(d.totalBugResolved, 'Bugs Fixed', '#06b6d4', d.bugResolvedDelta) : ''}
            ${d.totalBugOpen > 0 ? statPill(d.totalBugOpen, 'Bugs Open', '#22d3ee') : ''}
          </tr></table>
        </td></tr>

        <!-- 4. Critical callout -->
        ${criticalCallout}

        <!-- Member cards -->
        <tr><td style="background-color:#1e293b;padding:16px 16px;border-radius:0 0 12px 12px;">
          ${d.members.map(memberCard).join('')}
        </td></tr>

      </table>
    </td></tr>`;
  }

  // ── Top 3 leaderboard ──────────────────────────────────────────────────────
  const allMembers = depts.flatMap((d) => d.members.map((m) => ({ ...m, deptName: d.deptName })));
  const top3 = allMembers
    .filter((m) => m.onTimeCount > 0)
    .sort((a, b) => b.onTimeCount - a.onTimeCount || b.doneCount - a.doneCount)
    .slice(0, 3);

  const MEDALS = ['&#129351;', '&#129352;', '&#129353;'];
  const MEDAL_GRAD = ['linear-gradient(135deg,#78350f,#1e293b)', 'linear-gradient(135deg,#374151,#1e293b)', 'linear-gradient(135deg,#431407,#1e293b)'];
  const MEDAL_BORDER = ['#d97706', '#6b7280', '#b45309'];
  const MEDAL_COLOR = ['#fbbf24', '#9ca3af', '#f97316'];

  function leaderCard(m: typeof top3[0], rank: number): string {
    const pct = m.doneCount > 0 ? Math.round((m.onTimeCount / m.doneCount) * 100) : 0;
    return `<td style="padding:0 5px;vertical-align:bottom;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${MEDAL_GRAD[rank]};border-radius:12px;border:1px solid ${MEDAL_BORDER[rank]}40;">
        <tr><td style="padding:14px 12px;text-align:center;">
          <p style="margin:0 0 4px;font-size:24px;line-height:1;">${MEDALS[rank]}</p>
          <p style="margin:0 0 2px;font-size:12px;font-weight:700;color:#f1f5f9;">${m.name}</p>
          <p style="margin:0 0 8px;font-size:10px;color:#64748b;">${m.deptName}</p>
          <p style="margin:0 0 1px;font-size:20px;font-weight:800;color:${MEDAL_COLOR[rank]};">${m.onTimeCount}</p>
          <p style="margin:0 0 6px;font-size:10px;color:#94a3b8;">tasks on time</p>
          <span style="display:inline-block;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;background-color:${MEDAL_COLOR[rank]}20;color:${MEDAL_COLOR[rank]};border:1px solid ${MEDAL_COLOR[rank]}40;">${pct}% rate</span>
          <p style="margin:5px 0 0;font-size:10px;color:#475569;">${m.doneCount} total done</p>
        </td></tr>
      </table>
    </td>`;
  }

  const leaderboardSection = top3.length === 0 ? '' : `
  <tr><td style="padding-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e293b;border-radius:14px;border:1px solid rgba(255,255,255,0.07);">
      <tr><td style="padding:14px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:13px;font-weight:700;color:#f1f5f9;">&#127942; Top Performers — Most On-Time Tasks</p>
        <p style="margin:3px 0 0;font-size:11px;color:#475569;">Ranked by tasks completed on time this ${periodWord}</p>
      </td></tr>
      <tr><td style="padding:14px 12px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr align="center">
          ${top3.map((m, i) => leaderCard(m, i)).join('')}
        </tr></table>
      </td></tr>
    </table>
  </td></tr>`;

  // ── AI Performance Summary Callout ───────────────────────────────────
  const periodWordLabel = report.period === 'daily' ? 'Daily' : report.period === 'weekly' ? 'Weekly' : 'Monthly';
  const aiSummarySection = report.aiSummary ? `
  <tr><td style="padding-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e293b;border-radius:14px;border:1px solid rgba(255,255,255,0.07);">
      <tr><td style="padding:14px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:13px;font-weight:700;color:#f1f5f9;">✨ AI ${periodWordLabel} Performance Summary</p>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        ${report.aiSummary}
      </td></tr>
    </table>
  </td></tr>` : '';

  // ── 7. Executive summary table ─────────────────────────────────────────────
  const summaryTable = depts.length > 1 ? `
  <tr><td style="padding-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e293b;border-radius:14px;border:1px solid rgba(255,255,255,0.07);">
      <tr><td colspan="7" style="padding:14px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:13px;font-weight:700;color:#f1f5f9;">&#128202; Department Summary</p>
      </td></tr>
      <tr style="background-color:#172033;">
        <td style="padding:8px 16px;font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.5px;">DEPARTMENT</td>
        <td style="padding:8px 8px;font-size:10px;font-weight:700;color:#22c55e;letter-spacing:0.5px;text-align:center;">DONE</td>
        <td style="padding:8px 8px;font-size:10px;font-weight:700;color:#3b82f6;letter-spacing:0.5px;text-align:center;">ON TIME</td>
        <td style="padding:8px 8px;font-size:10px;font-weight:700;color:#f97316;letter-spacing:0.5px;text-align:center;">LATE</td>
        <td style="padding:8px 8px;font-size:10px;font-weight:700;color:#f59e0b;letter-spacing:0.5px;text-align:center;">PENDING</td>
        <td style="padding:8px 8px;font-size:10px;font-weight:700;color:#ef4444;letter-spacing:0.5px;text-align:center;">OVERDUE</td>
        <td style="padding:8px 16px 8px 8px;font-size:10px;font-weight:700;color:#06b6d4;letter-spacing:0.5px;text-align:center;">BUGS FIXED</td>
      </tr>
      ${depts.map((d, i) => `
      <tr style="background-color:${i % 2 === 0 ? '#1e293b' : '#1a2540'};">
        <td style="padding:9px 16px;font-size:12px;font-weight:600;color:#e2e8f0;border-top:1px solid rgba(255,255,255,0.04);">${d.deptName}</td>
        <td style="padding:9px 8px;font-size:13px;font-weight:700;color:#22c55e;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">${d.totalDone}${delta(d.doneDelta)}</td>
        <td style="padding:9px 8px;font-size:13px;font-weight:700;color:#3b82f6;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">${d.totalOnTime}${delta(d.onTimeDelta)}</td>
        <td style="padding:9px 8px;font-size:12px;color:${d.totalLate > 0 ? '#f97316' : '#475569'};text-align:center;border-top:1px solid rgba(255,255,255,0.04);">${d.totalLate || '—'}</td>
        <td style="padding:9px 8px;font-size:12px;color:${d.totalPending > 0 ? '#f59e0b' : '#475569'};text-align:center;border-top:1px solid rgba(255,255,255,0.04);">${d.totalPending || '—'}</td>
        <td style="padding:9px 8px;font-size:12px;font-weight:${d.totalOverdue > 0 ? '700' : '400'};color:${d.totalOverdue > 0 ? '#ef4444' : '#475569'};text-align:center;border-top:1px solid rgba(255,255,255,0.04);">${d.totalOverdue || '—'}</td>
        <td style="padding:9px 16px 9px 8px;font-size:12px;font-weight:700;color:${d.totalBugResolved > 0 ? '#06b6d4' : '#475569'};text-align:center;border-top:1px solid rgba(255,255,255,0.04);">${d.totalBugResolved || '—'}${delta(d.bugResolvedDelta)}</td>
      </tr>`).join('')}
    </table>
  </td></tr>` : '';

  // ── Full email ─────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <!-- 5. Mobile responsive viewport -->
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${reportTitle} — ${report.orgName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<!-- 9. Preheader (inbox preview text) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#0f172a;">
  ${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
</div>

<!-- 5. Mobile-first outer wrapper: max-width instead of fixed width -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:32px 12px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <!-- Logo -->
  <tr><td align="center" style="padding-bottom:24px;">
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;">
        <span style="font-size:22px;line-height:44px;">&#9889;</span>
      </td>
      <td style="padding-left:12px;vertical-align:middle;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p>
        <p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- Report title card -->
  <tr><td style="background:linear-gradient(135deg,#1e3a8a,#1e293b);border-radius:16px;border:1px solid rgba(255,255,255,0.1);padding:28px 28px 24px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#93c5fd;letter-spacing:1px;text-transform:uppercase;">
      ${report.period === 'daily' ? '&#128197;' : report.period === 'weekly' ? '&#128336;' : '&#128200;'}
      ${reportTitle} &bull; ${report.orgName}
    </p>
    <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#ffffff;">${periodLabel}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#94a3b8;">Hi ${firstName}, here is your ${periodWord} performance summary.</p>
    <table cellpadding="0" cellspacing="0"><tr>
      ${statPill(grandStats.totalDone, 'Total Done', '#22c55e')}
      ${statPill(grandStats.totalOnTime, 'On Time', '#3b82f6')}
      ${statPill(grandStats.totalLate, 'Late', '#f97316')}
      ${grandStats.totalReviewPending > 0 ? statPill(grandStats.totalReviewPending, 'In Review', '#8b5cf6') : ''}
      ${statPill(grandStats.totalPending, 'Pending', '#f59e0b')}
      ${statPill(grandStats.totalOverdue, 'Overdue', '#ef4444')}
      ${grandStats.totalBugResolved + grandStats.totalBugInReview + grandStats.totalBugOpen > 0 ? statPill(grandStats.totalBugResolved, 'Bugs Fixed', '#06b6d4') : ''}
    </tr></table>
  </td></tr>

  <tr><td style="height:20px;"></td></tr>

  <!-- AI Daily Performance Summary -->
  ${aiSummarySection}

  <!-- 7. Executive summary table -->
  ${summaryTable}

  <!-- Top 3 leaderboard -->
  ${leaderboardSection}

  <!-- Department sections -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${depts.map(deptSection).join('')}
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" style="padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);">
    <p style="margin:0 0 4px;font-size:11px;color:#334155;">Automated ${report.period} report from GrowthRhythm OS.</p>
    <p style="margin:0;font-size:11px;color:#334155;">
      &copy; 2026 GrowthRhythm OS by Gupio &bull;
      <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();
}

// ── 10. Plain-text fallback ────────────────────────────────────────────────────
export function renderReportText(report: OrgReport): string {
  const lines: string[] = [];
  lines.push(`${report.period.toUpperCase()} PERFORMANCE REPORT — ${report.orgName}`);
  lines.push(`Period: ${fmtPeriodLabel(report.period, report.from, report.to)}`);
  lines.push('');
  lines.push(`SUMMARY | Done: ${report.totalDone} | On Time: ${report.totalOnTime} | Late: ${report.totalLate} | In Review: ${report.totalReviewPending} | Pending: ${report.totalPending} | Overdue: ${report.totalOverdue}`);
  if (report.totalBugResolved + report.totalBugInReview + report.totalBugOpen > 0) {
    lines.push(`BUGS | Fixed: ${report.totalBugResolved} | In Review: ${report.totalBugInReview} | Open: ${report.totalBugOpen}`);
  }
  lines.push('');

  const textSummary = report.aiSummary
    ? report.aiSummary
        .replace(/<strong style="color:#ffffff;">(.*?)<\/strong>/g, '$1')
        .replace(/<li[^>]*>/g, '  - ')
        .replace(/<\/li>/g, '\n')
        .replace(/<[^>]*>/g, '')
        .trim()
    : '';

  if (textSummary) {
    lines.push('AI DAILY PERFORMANCE SUMMARY');
    lines.push(textSummary);
    lines.push('');
  }

  for (const dept of report.departments) {
    lines.push('='.repeat(52));
    lines.push(`  ${dept.deptName.toUpperCase()}${dept.headName ? ` (Head: ${dept.headName})` : ''}`);
    lines.push(`  Done: ${dept.totalDone} | On Time: ${dept.totalOnTime} | Late: ${dept.totalLate} | Overdue: ${dept.totalOverdue}`);
    if (dept.totalBugResolved + dept.totalBugInReview + dept.totalBugOpen > 0) {
      lines.push(`  Bugs — Fixed: ${dept.totalBugResolved} | In Review: ${dept.totalBugInReview} | Open: ${dept.totalBugOpen}`);
    }
    lines.push('');

    for (const m of dept.members) {
      const hasBugActivity = m.bugResolvedCount > 0 || m.bugInReviewCount > 0 || m.bugOpenCount > 0;
      if (m.doneCount === 0 && m.reviewPendingCount === 0 && m.pendingCount === 0 && m.overdueCount === 0 && !hasBugActivity) {
        lines.push(`  ${m.name} — No activity this period`);
        continue;
      }
      lines.push(`  ${m.name} (${ROLE_LABEL[m.role] ?? m.role})`);
      lines.push(`    Done: ${m.doneCount} | On Time: ${m.onTimeCount} | Late: ${m.lateCount} | In Review: ${m.reviewPendingCount} | Overdue: ${m.overdueCount}`);
      for (const t of m.doneTasks)
        lines.push(`    ✓ ${t.title} ${t.daysLate ? `[${t.daysLate}d late]` : '[on time]'}${t.teamName ? ` — ${t.teamName}` : ''}`);
      for (const t of m.reviewPendingTasks)
        lines.push(`    ⏳ ${t.title} [submitted on time, awaiting review]${t.teamName ? ` — ${t.teamName}` : ''}`);
      for (const t of m.overdueTasks)
        lines.push(`    ⚠ ${t.title} [${t.overdueDays}d overdue, due: ${fmtDate(t.dueDate)}]${t.teamName ? ` — ${t.teamName}` : ''}`);
      for (const t of m.pendingTasks)
        lines.push(`    ○ ${t.title} [pending, due: ${fmtDate(t.dueDate)}]${t.teamName ? ` — ${t.teamName}` : ''}`);
      if (hasBugActivity) {
        lines.push(`    Bugs — Fixed: ${m.bugResolvedCount} | In Review: ${m.bugInReviewCount} | Open: ${m.bugOpenCount}`);
        for (const b of m.resolvedBugs)
          lines.push(`    \u{1F41B} ${b.title} [${b.status.toLowerCase()}]${b.teamName ? ` — ${b.teamName}` : ''}`);
        for (const b of m.inReviewBugs)
          lines.push(`    \u{23F3} ${b.title} [in review]${b.teamName ? ` — ${b.teamName}` : ''}`);
        for (const b of m.openBugs)
          lines.push(`    \u{25CB} ${b.title} [open, ${b.severity.toLowerCase()}]${b.teamName ? ` — ${b.teamName}` : ''}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('Automated report from GrowthRhythm OS by Gupio — mygupio.com');
  return lines.join('\n');
}
