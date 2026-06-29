import prisma from '../lib/prisma';

// ── IST helpers ───────────────────────────────────────────────────────────────
const IST_MS = 5.5 * 3600 * 1000; // UTC+5:30

function toIST(d: Date) { return new Date(d.getTime() + IST_MS); }
function fromIST(d: Date) { return new Date(d.getTime() - IST_MS); }

function istStartOfDay(d: Date): Date {
  const ist = new Date(d);
  ist.setUTCHours(0, 0, 0, 0);
  return fromIST(ist);
}
function istEndOfDay(d: Date): Date {
  const ist = new Date(d);
  ist.setUTCHours(23, 59, 59, 999);
  return fromIST(ist);
}

export function getPeriodRange(period: 'daily' | 'weekly' | 'monthly') {
  const now = toIST(new Date());

  if (period === 'daily') {
    return { from: istStartOfDay(now), to: istEndOfDay(now) };
  }

  if (period === 'weekly') {
    const dow = now.getUTCDay(); // 0=Sun
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: istStartOfDay(monday), to: istEndOfDay(sunday) };
  }

  // monthly
  const first = new Date(now); first.setUTCDate(1);
  const last = new Date(now);
  last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  return { from: istStartOfDay(first), to: istEndOfDay(last) };
}

export function isLastDayOfMonthIST(): boolean {
  const now = toIST(new Date());
  const tomorrow = new Date(now); tomorrow.setUTCDate(now.getUTCDate() + 1);
  return tomorrow.getUTCMonth() !== now.getUTCMonth();
}

// ── Types ──────────────────────────────────────────────────────────────────────
export type TaskInfo = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  completedAt: Date | null;
  completionSubmittedAt: Date | null;
  teamName: string | null;
  // Derived
  doneInPeriod: boolean;
  daysLate: number | null;  // null = on time; positive = days late
  overdueDays: number | null; // for not-done tasks overdue by N days
};

export type MemberReport = {
  userId: string;
  name: string;
  role: string;
  doneTasks: TaskInfo[];
  reviewPendingTasks: TaskInfo[]; // IN_REVIEW + submitted on time — waiting for reviewer
  pendingTasks: TaskInfo[];       // due in period, not submitted yet
  overdueTasks: TaskInfo[];       // due BEFORE period, not submitted
  doneCount: number;
  onTimeCount: number;
  lateCount: number;
  reviewPendingCount: number;
  pendingCount: number;
  overdueCount: number;
};

export type DeptReport = {
  deptId: string;
  deptName: string;
  headName: string | null;
  headEmail: string | null;
  members: MemberReport[];
  // dept-level stats
  totalDone: number;
  totalOnTime: number;
  totalLate: number;
  totalReviewPending: number;
  totalPending: number;
  totalOverdue: number;
};

export type OrgReport = {
  orgId: string;
  orgName: string;
  period: 'daily' | 'weekly' | 'monthly';
  from: Date;
  to: Date;
  departments: DeptReport[];
  // org-level totals
  totalDone: number;
  totalOnTime: number;
  totalLate: number;
  totalReviewPending: number;
  totalPending: number;
  totalOverdue: number;
};

// ── Data builder ───────────────────────────────────────────────────────────────
export async function buildOrgReport(
  orgId: string,
  period: 'daily' | 'weekly' | 'monthly',
): Promise<OrgReport> {
  const { from, to } = getPeriodRange(period);
  const now = new Date();

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { id: true, name: true },
  });

  // Fetch all active departments with head and active members
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

  // Fetch all relevant tasks in one query
  // Done in period: completedAt within [from, to]
  // Pending/overdue: dueDate set, not done/cancelled, dueDate <= to
  const tasks = await prisma.task.findMany({
    where: {
      orgId,
      assigneeUserId: { not: null },
      OR: [
        // Done within the period
        { status: 'DONE', completedAt: { gte: from, lte: to } },
        // Not done but due on or before end of period
        {
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lte: to },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      completedAt: true,
      completionSubmittedAt: true,
      assigneeUserId: true,
      departmentId: true,
      team: { select: { name: true } },
    },
  });

  // Index tasks by assigneeUserId
  const tasksByUser = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.assigneeUserId) continue;
    if (!tasksByUser.has(t.assigneeUserId)) tasksByUser.set(t.assigneeUserId, []);
    tasksByUser.get(t.assigneeUserId)!.push(t);
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
          // Use completionSubmittedAt (when member submitted) not completedAt (when reviewer approved)
          // so reviewer delays never count against the member
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
            teamName: t.team?.name ?? null,
            doneInPeriod: true,
            daysLate,
            overdueDays: null,
          });
        } else if (t.status !== 'DONE' && t.status !== 'CANCELLED' && t.dueDate) {
          // Check if member already submitted for review on time — reviewer delay, not member's fault
          const submittedOnTime =
            t.status === 'IN_REVIEW' &&
            t.completionSubmittedAt !== null &&
            t.completionSubmittedAt <= t.dueDate;

          if (submittedOnTime) {
            // Member did their part — waiting for reviewer
            reviewPendingTasks.push({
              id: t.id, title: t.title, status: t.status, priority: t.priority,
              dueDate: t.dueDate, completedAt: null,
              completionSubmittedAt: t.completionSubmittedAt,
              teamName: t.team?.name ?? null,
              doneInPeriod: false,
              daysLate: null,
              overdueDays: null,
            });
          } else {
            const overdueDays = Math.floor((now.getTime() - t.dueDate.getTime()) / 86400000);
            const info: TaskInfo = {
              id: t.id, title: t.title, status: t.status, priority: t.priority,
              dueDate: t.dueDate, completedAt: null, completionSubmittedAt: t.completionSubmittedAt,
              teamName: t.team?.name ?? null,
              doneInPeriod: false,
              daysLate: null,
              overdueDays: overdueDays > 0 ? overdueDays : null,
            };
            if (t.dueDate < from) {
              overdueTasks.push(info);
            } else {
              pendingTasks.push(info);
            }
          }
        }
      }

      // Sort
      doneTasks.sort((a, b) => (b.daysLate ?? -1) - (a.daysLate ?? -1));
      reviewPendingTasks.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
      pendingTasks.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
      overdueTasks.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));

      const onTimeCount = doneTasks.filter((t) => t.daysLate === null).length;
      const lateCount = doneTasks.filter((t) => t.daysLate !== null).length;

      memberReports.push({
        userId: user.id,
        name: user.name,
        role: user.role,
        doneTasks,
        reviewPendingTasks,
        pendingTasks,
        overdueTasks,
        doneCount: doneTasks.length,
        onTimeCount,
        lateCount,
        reviewPendingCount: reviewPendingTasks.length,
        pendingCount: pendingTasks.length,
        overdueCount: overdueTasks.length,
      });
    }

    const totalDone = memberReports.reduce((s, m) => s + m.doneCount, 0);
    const totalOnTime = memberReports.reduce((s, m) => s + m.onTimeCount, 0);
    const totalLate = memberReports.reduce((s, m) => s + m.lateCount, 0);
    const totalReviewPending = memberReports.reduce((s, m) => s + m.reviewPendingCount, 0);
    const totalPending = memberReports.reduce((s, m) => s + m.pendingCount, 0);
    const totalOverdue = memberReports.reduce((s, m) => s + m.overdueCount, 0);

    deptReports.push({
      deptId: dept.id,
      deptName: dept.name,
      headName: dept.head?.name ?? null,
      headEmail: dept.head?.email ?? null,
      members: memberReports,
      totalDone, totalOnTime, totalLate, totalReviewPending, totalPending, totalOverdue,
    });
  }

  return {
    orgId,
    orgName: org.name,
    period,
    from,
    to,
    departments: deptReports,
    totalDone: deptReports.reduce((s, d) => s + d.totalDone, 0),
    totalOnTime: deptReports.reduce((s, d) => s + d.totalOnTime, 0),
    totalLate: deptReports.reduce((s, d) => s + d.totalLate, 0),
    totalReviewPending: deptReports.reduce((s, d) => s + d.totalReviewPending, 0),
    totalPending: deptReports.reduce((s, d) => s + d.totalPending, 0),
    totalOverdue: deptReports.reduce((s, d) => s + d.totalOverdue, 0),
  };
}

// ── Formatters ─────────────────────────────────────────────────────────────────
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

// ── HTML template ──────────────────────────────────────────────────────────────
export function renderReportHtml(
  report: OrgReport,
  recipientRole: 'OWNER' | 'DEPT_HEAD',
  recipientName: string,
  filterDeptId?: string, // dept heads see only their dept
): string {
  const firstName = recipientName.split(' ')[0];
  const periodLabel = fmtPeriodLabel(report.period, report.from, report.to);
  const reportTitle = report.period === 'daily' ? 'Daily Report' :
    report.period === 'weekly' ? 'Weekly Report' : 'Monthly Report';

  const depts = filterDeptId
    ? report.departments.filter((d) => d.deptId === filterDeptId)
    : report.departments;

  const grandStats = filterDeptId
    ? depts[0] ?? { totalDone: 0, totalOnTime: 0, totalLate: 0, totalPending: 0, totalOverdue: 0 }
    : report;

  // ── Top 3 performers (on-time tasks desc, total done as tiebreaker) ────────
  const allMembers = depts.flatMap((d) =>
    d.members.map((m) => ({ ...m, deptName: d.deptName })),
  );
  const top3 = allMembers
    .filter((m) => m.onTimeCount > 0)
    .sort((a, b) => b.onTimeCount - a.onTimeCount || b.doneCount - a.doneCount)
    .slice(0, 3);

  const MEDALS = ['&#129351;', '&#129352;', '&#129353;']; // 🥇🥈🥉
  const MEDAL_GRADIENTS = [
    'linear-gradient(135deg,#78350f,#1e293b)',
    'linear-gradient(135deg,#374151,#1e293b)',
    'linear-gradient(135deg,#431407,#1e293b)',
  ];
  const MEDAL_BORDERS = ['#d97706', '#6b7280', '#b45309'];
  const MEDAL_LABEL_COLOR = ['#fbbf24', '#9ca3af', '#f97316'];

  function leaderCard(m: typeof top3[0], rank: number): string {
    const onTimePct = m.doneCount > 0 ? Math.round((m.onTimeCount / m.doneCount) * 100) : 0;
    const width = rank === 0 ? '200px' : rank === 1 ? '185px' : '170px';
    return `
    <td style="padding:0 6px;vertical-align:bottom;width:${width};">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${MEDAL_GRADIENTS[rank]};border-radius:14px;border:1px solid ${MEDAL_BORDERS[rank]}40;">
        <tr><td style="padding:16px 14px 14px;text-align:center;">
          <p style="margin:0 0 4px;font-size:26px;line-height:1;">${MEDALS[rank]}</p>
          <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#f1f5f9;">${m.name}</p>
          <p style="margin:0 0 10px;font-size:10px;color:#64748b;">${m.deptName}</p>
          <p style="margin:0 0 2px;font-size:22px;font-weight:800;color:${MEDAL_LABEL_COLOR[rank]};">${m.onTimeCount}</p>
          <p style="margin:0 0 8px;font-size:10px;color:#94a3b8;font-weight:500;">tasks on time</p>
          <div style="background-color:rgba(255,255,255,0.06);border-radius:6px;padding:4px 8px;display:inline-block;">
            <span style="font-size:11px;color:${MEDAL_LABEL_COLOR[rank]};font-weight:600;">${onTimePct}% on-time rate</span>
          </div>
          <p style="margin:6px 0 0;font-size:10px;color:#475569;">${m.doneCount} total done</p>
        </td></tr>
      </table>
    </td>`;
  }

  const leaderboardSection = top3.length === 0 ? '' : `
  <!-- Top 3 Leaderboard -->
  <tr><td style="padding-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1e293b;border-radius:14px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;">
      <tr><td style="padding:16px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:13px;font-weight:700;color:#f1f5f9;letter-spacing:0.3px;">
          &#127942; Top Performers — Most On-Time Tasks
        </p>
        <p style="margin:3px 0 0;font-size:11px;color:#475569;">Ranked by tasks completed on time this ${report.period === 'daily' ? 'day' : report.period === 'weekly' ? 'week' : 'month'}</p>
      </td></tr>
      <tr><td style="padding:16px 14px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr align="center">
          ${top3.map((m, i) => leaderCard(m, i)).join('')}
        </tr></table>
      </td></tr>
    </table>
  </td></tr>`;

  // ── Stat pill ──────────────────────────────────────────────────────────────
  function statPill(value: number, label: string, color: string): string {
    return `<td style="padding:0 8px 0 0;white-space:nowrap;">
      <div style="display:inline-block;background-color:${color}18;border:1px solid ${color}30;border-radius:8px;padding:6px 12px;text-align:center;">
        <p style="margin:0;font-size:18px;font-weight:700;color:${color};">${value}</p>
        <p style="margin:0;font-size:10px;color:#94a3b8;font-weight:500;">${label}</p>
      </div>
    </td>`;
  }

  // ── Task row ───────────────────────────────────────────────────────────────
  function taskRow(t: TaskInfo, type: 'done' | 'pending' | 'overdue' | 'review-pending'): string {
    const pc = PRIORITY_COLOR[t.priority] ?? '#94a3b8';
    const badge = type === 'done'
      ? t.daysLate === null
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#22c55e20;color:#22c55e;border:1px solid #22c55e30;">&#10003; On Time</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#ef444420;color:#ef4444;border:1px solid #ef444430;">${t.daysLate}d late</span>`
      : type === 'review-pending'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#8b5cf620;color:#a78bfa;border:1px solid #8b5cf640;">&#9203; Submitted On Time — Awaiting Review</span>`
      : type === 'overdue'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:#ef444420;color:#ef4444;border:1px solid #ef444430;">&#9888; ${t.overdueDays}d overdue</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background-color:${STATUS_COLOR[t.status] ?? '#64748b'}20;color:${STATUS_COLOR[t.status] ?? '#64748b'};border:1px solid ${STATUS_COLOR[t.status] ?? '#64748b'}30;">${STATUS_LABEL[t.status] ?? t.status}</span>`;

    const dueLine = t.dueDate
      ? `<span style="font-size:10px;color:#64748b;margin-left:8px;">Due: ${fmtDate(t.dueDate)}</span>`
      : '';
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

  // ── Member card ────────────────────────────────────────────────────────────
  function memberCard(m: MemberReport): string {
    const onTimePct = m.doneCount > 0 ? Math.round((m.onTimeCount / m.doneCount) * 100) : 0;
    const barColor = onTimePct >= 80 ? '#22c55e' : onTimePct >= 50 ? '#f59e0b' : '#ef4444';

    const doneRows = m.doneTasks.length > 0
      ? m.doneTasks.map((t) => taskRow(t, 'done')).join('')
      : `<tr><td style="padding:8px 0;font-size:12px;color:#475569;font-style:italic;">No tasks completed this period.</td></tr>`;

    const reviewPendingSection = m.reviewPendingTasks.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#a78bfa;letter-spacing:0.5px;">&#9203; SUBMITTED ON TIME — AWAITING REVIEW (${m.reviewPendingTasks.length})</p>
        </td></tr>
        ${m.reviewPendingTasks.map((t) => taskRow(t, 'review-pending')).join('')}`
      : '';

    const pendingSection = m.pendingTasks.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#f59e0b;letter-spacing:0.5px;">DUE THIS PERIOD — NOT SUBMITTED (${m.pendingTasks.length})</p>
        </td></tr>
        ${m.pendingTasks.map((t) => taskRow(t, 'pending')).join('')}`
      : '';

    const overdueSection = m.overdueTasks.length > 0
      ? `<tr><td style="padding:10px 0 4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.5px;">OVERDUE — NOT SUBMITTED (${m.overdueTasks.length})</p>
        </td></tr>
        ${m.overdueTasks.map((t) => taskRow(t, 'overdue')).join('')}`
      : '';

    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;background-color:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.07);">
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <p style="margin:0;font-size:14px;font-weight:700;color:#f1f5f9;">${m.name}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">${ROLE_LABEL[m.role] ?? m.role}</p>
            </td>
            <td align="right">
              <p style="margin:0;font-size:11px;color:#94a3b8;">On-time rate</p>
              <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${barColor};">${onTimePct}%</p>
            </td>
          </tr></table>
          <!-- mini stats -->
          <table cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>
            ${statPill(m.doneCount, 'Done', '#22c55e')}
            ${statPill(m.onTimeCount, 'On Time', '#3b82f6')}
            ${statPill(m.lateCount, 'Late', '#f97316')}
            ${m.reviewPendingCount > 0 ? statPill(m.reviewPendingCount, 'In Review', '#8b5cf6') : ''}
            ${statPill(m.pendingCount, 'Pending', '#f59e0b')}
            ${statPill(m.overdueCount, 'Overdue', '#ef4444')}
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
        </table>
      </td></tr>
    </table>`;
  }

  // ── Department section ─────────────────────────────────────────────────────
  function deptSection(d: DeptReport): string {
    const completionPct = (d.totalDone + d.totalPending + d.totalOverdue) > 0
      ? Math.round((d.totalDone / (d.totalDone + d.totalPending + d.totalOverdue)) * 100)
      : 0;

    return `
    <!-- DEPT: ${d.deptName} -->
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <!-- dept header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f,#1e293b);border-radius:12px 12px 0 0;padding:16px 20px;border-bottom:2px solid #2563eb;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">&#127970; ${d.deptName}</p>
              ${d.headName ? `<p style="margin:3px 0 0;font-size:12px;color:#93c5fd;">Head: ${d.headName}</p>` : ''}
            </td>
            <td align="right">
              <p style="margin:0;font-size:11px;color:#93c5fd;">Completion</p>
              <p style="margin:2px 0 0;font-size:20px;font-weight:800;color:#60a5fa;">${completionPct}%</p>
            </td>
          </tr></table>
        </td></tr>

        <!-- dept stats bar -->
        <tr><td style="background-color:#172033;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <table cellpadding="0" cellspacing="0"><tr>
            ${statPill(d.totalDone, 'Done', '#22c55e')}
            ${statPill(d.totalOnTime, 'On Time', '#3b82f6')}
            ${statPill(d.totalLate, 'Late', '#f97316')}
            ${d.totalReviewPending > 0 ? statPill(d.totalReviewPending, 'In Review', '#8b5cf6') : ''}
            ${statPill(d.totalPending, 'Pending', '#f59e0b')}
            ${statPill(d.totalOverdue, 'Overdue', '#ef4444')}
          </tr></table>
        </td></tr>

        <!-- members -->
        <tr><td style="background-color:#1e293b;padding:16px 16px;border-radius:0 0 12px 12px;">
          ${d.members.map(memberCard).join('')}
        </td></tr>
      </table>
    </td></tr>`;
  }

  // ── Full email ─────────────────────────────────────────────────────────────
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${reportTitle} — ${report.orgName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <!-- Logo header -->
  <tr><td align="center" style="padding-bottom:28px;">
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
  <tr><td style="background:linear-gradient(135deg,#1e3a8a,#1e293b);border-radius:16px;border:1px solid rgba(255,255,255,0.1);padding:32px 36px;margin-bottom:20px;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#93c5fd;letter-spacing:1px;text-transform:uppercase;">
      ${report.period === 'daily' ? '&#128197;' : report.period === 'weekly' ? '&#128336;' : '&#128200;'}
      ${reportTitle} &bull; ${report.orgName}
    </p>
    <h1 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#ffffff;">${periodLabel}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">Hi ${firstName}, here is your ${report.period} performance summary across all departments.</p>

    <!-- Org-level summary stats -->
    <table cellpadding="0" cellspacing="0"><tr>
      ${statPill(grandStats.totalDone, 'Total Done', '#22c55e')}
      ${statPill(grandStats.totalOnTime, 'On Time', '#3b82f6')}
      ${statPill(grandStats.totalLate, 'Submitted Late', '#f97316')}
      ${statPill(grandStats.totalPending, 'Still Pending', '#f59e0b')}
      ${statPill(grandStats.totalOverdue, 'Overdue', '#ef4444')}
    </tr></table>
  </td></tr>

  <tr><td style="height:20px;"></td></tr>

  ${leaderboardSection}

  <!-- Department sections -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${depts.map(deptSection).join('')}
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" style="padding-top:28px;border-top:1px solid rgba(255,255,255,0.06);">
    <p style="margin:0 0 6px;font-size:12px;color:#334155;">
      This is an automated ${report.period} report from GrowthRhythm OS.
    </p>
    <p style="margin:0;font-size:12px;color:#334155;">
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
