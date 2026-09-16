/**
 * Bulk task import.
 *
 * The contract with the uploader is deliberately lopsided: a row needs a title
 * and a person we can identify, and nothing else. Every other column is parsed
 * as leniently as we can manage, and whatever we had to guess, default or drop
 * comes back as a per-row warning. Rows missing their dates still import — the
 * status gate in routes/tasks.ts then holds them at To Do until someone fills
 * the gaps in, so a sloppy sheet can never put half-specified work in flight.
 *
 * Callers run this twice: once with `dryRun` to show the uploader exactly what
 * will happen, then again to commit.
 */

import prisma from '../lib/prisma';
import { createNotification } from './notification.service';
import {
  CanonicalField,
  LEGACY_ROW_KEYS,
  normalizeCell,
  parseLooseDate,
  parsePriority,
  parseRecurrence,
  resolveByName,
  resolvePerson,
  squash,
  toWorkingHoursInstant,
  isValidTimeZone,
  type Priority,
  type Recurrence,
} from '../lib/importNormalize';

/** Hard ceiling per request — keeps one upload from monopolising the API. */
export const MAX_IMPORT_ROWS = 1000;

export type ImportRowInput = Record<string, unknown>;

export type ImportOptions = {
  orgId: string;
  actorUserId: string;
  /** IANA zone the uploader's dates are written in. Defaults to UTC. */
  timeZone?: string;
  /** Day-first (15/07) vs month-first (07/15) for ambiguous numeric dates. */
  dayFirst?: boolean;
  dryRun: boolean;
};

export type ResolvedRow = {
  title: string;
  assignee: { id: string; name: string; email: string } | null;
  department: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  description: string | null;
  expectedOutcome: string | null;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  recurrence: Recurrence;
};

export type ImportRowResult = {
  /** 1-based position in the uploaded sheet, for pointing at the right row. */
  row: number;
  status: 'ready' | 'blocked' | 'imported';
  /** Blocking problems — a row with any of these is never created. */
  errors: string[];
  /** Things we guessed, defaulted or dropped. The row still imports. */
  warnings: string[];
  /** Fields the assignee must fill before the task can leave To Do. */
  missingBeforeStart: string[];
  resolved: ResolvedRow;
  taskId?: string;
};

export type ImportResult = {
  timeZone: string;
  dayFirst: boolean;
  dryRun: boolean;
  summary: {
    total: number;
    ready: number;
    blocked: number;
    imported: number;
    withWarnings: number;
    needsDates: number;
    truncated: number;
  };
  rows: ImportRowResult[];
  /** Flat fields the pre-wizard client still reads. */
  created: number;
  errors: string[];
};

/** Read a canonical field off a row, tolerating legacy and loosely-cased keys. */
function readField(row: ImportRowInput, field: CanonicalField): string {
  if (row[field] !== undefined) return normalizeCell(row[field]);

  for (const [legacyKey, canonical] of Object.entries(LEGACY_ROW_KEYS)) {
    if (canonical === field && row[legacyKey] !== undefined) return normalizeCell(row[legacyKey]);
  }

  // Last resort for hand-built payloads: match on the squashed key name.
  const target = squash(field);
  for (const [key, value] of Object.entries(row)) {
    if (squash(key) === target) return normalizeCell(value);
  }
  return '';
}

function quoteList(values: string[], limit = 3): string {
  const shown = values.slice(0, limit).map((value) => `"${value}"`).join(', ');
  return values.length > limit ? `${shown} and ${values.length - limit} more` : shown;
}

export async function runTaskImport(
  rawRows: ImportRowInput[],
  options: ImportOptions,
): Promise<ImportResult> {
  const { orgId, actorUserId, dryRun } = options;
  const timeZone = isValidTimeZone(options.timeZone) ? options.timeZone : 'UTC';
  const dayFirst = options.dayFirst ?? true;

  const rows = rawRows.slice(0, MAX_IMPORT_ROWS);
  const truncated = rawRows.length - rows.length;

  // One lookup each, reused across every row.
  const [people, departments, teams] = await Promise.all([
    prisma.user.findMany({
      where: { orgId, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, departmentId: true },
    }),
    prisma.department.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.team.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true, department: { select: { id: true, name: true } } },
    }),
  ]);

  // Existing open work, for the "this already exists" warning.
  const openTasks = await prisma.task.findMany({
    where: { orgId, status: { notIn: ['DONE', 'CANCELLED'] } },
    select: { title: true, assigneeUserId: true },
  });
  const existingKeys = new Set(openTasks.map((task) => `${squash(task.title)}|${task.assigneeUserId ?? ''}`));
  const seenInFile = new Set<string>();

  const nowLocal = new Date();
  const today = { year: nowLocal.getFullYear(), month: nowLocal.getMonth(), day: nowLocal.getDate() };
  const dateOptions = { dayFirst, today };

  const results: ImportRowResult[] = [];

  for (const [index, row] of rows.entries()) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ── Title (required) ──
    const rawTitle = readField(row, 'title');
    const title = rawTitle.replace(/\s*\n\s*/g, ' ').slice(0, 500);
    if (!title) errors.push('Task title is empty.');
    else if (title.length < 2) errors.push(`Task title "${title}" is too short — it needs at least 2 characters.`);
    if (rawTitle.length > 500) warnings.push('Title was longer than 500 characters and has been trimmed.');

    // ── Assignee (required) ──
    const rawAssignee = readField(row, 'assignee');
    let assignee: { id: string; name: string; email: string; departmentId: string | null } | null = null;
    if (!rawAssignee) {
      errors.push('No assignee — add an email or the person\'s name in the assignee column.');
    } else {
      const found = resolvePerson(rawAssignee, people);
      if (found.match) {
        assignee = people.find((person) => person.id === found.match!.id) ?? null;
        if (found.confidence === 'fuzzy') {
          warnings.push(`Read "${rawAssignee}" as ${found.match.name} (${found.match.email}) — check that's the right person.`);
        }
      } else if (found.ambiguous.length) {
        errors.push(`"${rawAssignee}" matches ${found.ambiguous.length} people (${quoteList(found.ambiguous.map((p) => p.name))}) — use their email address instead.`);
      } else {
        errors.push(`No active team member matches "${rawAssignee}".`);
      }
    }

    // ── Department ──
    // The task's department always follows the assignee, exactly as it does when
    // a task is created by hand, so a department column can only ever disagree.
    const rawDepartment = readField(row, 'department');
    let department = assignee?.departmentId
      ? departments.find((dept) => dept.id === assignee!.departmentId) ?? null
      : null;
    if (rawDepartment) {
      const found = resolveByName(rawDepartment, departments);
      if (!found.match && !found.ambiguous.length) {
        warnings.push(`No department called "${rawDepartment}" — used ${department ? department.name : 'none'} instead.`);
      } else if (found.match && department && found.match.id !== department.id) {
        warnings.push(`Sheet says "${rawDepartment}" but ${assignee?.name ?? 'the assignee'} is in ${department.name} — kept ${department.name}.`);
      } else if (found.match && !department) {
        department = found.match;
      }
    }

    // ── Project ──
    const rawProject = readField(row, 'project');
    let project: { id: string; name: string } | null = null;
    if (rawProject) {
      const found = resolveByName(rawProject, teams);
      if (found.match) {
        const team = teams.find((candidate) => candidate.id === found.match!.id)!;
        // Engineering projects require a phase, which a flat sheet has no way to
        // name. Linking without one would leave a task that rejects every later
        // edit, so the link is dropped and called out instead.
        if (team.department?.name.toLowerCase().includes('engineering')) {
          warnings.push(`"${team.name}" is an Engineering project, which needs a phase — imported without the project link. Set it from the task's edit dialog.`);
        } else {
          project = { id: team.id, name: team.name };
          if (found.confidence === 'fuzzy') {
            warnings.push(`Read project "${rawProject}" as "${team.name}".`);
          }
        }
      } else if (found.ambiguous.length) {
        warnings.push(`Project "${rawProject}" matches ${quoteList(found.ambiguous.map((t) => t.name))} — left blank.`);
      } else {
        warnings.push(`No project called "${rawProject}" — left blank.`);
      }
    }

    // ── Priority ──
    const rawPriority = readField(row, 'priority');
    let priority: Priority = 'MEDIUM';
    if (rawPriority) {
      const parsed = parsePriority(rawPriority);
      if (parsed) priority = parsed;
      else warnings.push(`Couldn't read priority "${rawPriority}" — set to Medium.`);
    }

    // ── Recurrence ──
    const rawRecurrence = readField(row, 'recurrence');
    let recurrence: Recurrence = 'NONE';
    if (rawRecurrence) {
      const parsed = parseRecurrence(rawRecurrence);
      if (parsed) recurrence = parsed;
      else warnings.push(`Couldn't read recurrence "${rawRecurrence}" — set to one-off.`);
    }

    // ── Dates ──
    // Unreadable or absent dates never block the import; they become gaps the
    // status gate makes someone close before the task can start.
    const readDate = (field: 'startDate' | 'dueDate', bound: 'start' | 'end', label: string) => {
      const raw = readField(row, field);
      if (!raw) return null;
      const parts = parseLooseDate(raw, dateOptions);
      if (!parts) {
        warnings.push(`Couldn't read ${label} "${raw}" — left blank for someone to fill in.`);
        return null;
      }
      if (parts.orderAssumed) {
        warnings.push(`"${raw}" could be day-first or month-first — read as ${parts.day}/${parts.month + 1}/${parts.year}.`);
      }
      const { date, clamped } = toWorkingHoursInstant(parts, bound, timeZone);
      if (clamped) {
        warnings.push(`${label} "${raw}" falls outside working hours (9:30 AM – 7:30 PM) — moved to the nearest edge.`);
      }
      return date;
    };

    const startDate = readDate('startDate', 'start', 'start date');
    const dueDate = readDate('dueDate', 'end', 'end date');

    if (startDate && dueDate && startDate > dueDate) {
      warnings.push('Start date is after the end date — fix the dates before this task can start.');
    }

    const missingBeforeStart: string[] = [];
    if (!startDate) missingBeforeStart.push('start date');
    if (!dueDate) missingBeforeStart.push('end date');
    if (missingBeforeStart.length) {
      warnings.push(`No ${missingBeforeStart.join(' or ')} — the task imports as To Do and can't be started until it's set.`);
    }

    // ── Duplicates ──
    if (title && assignee) {
      const key = `${squash(title)}|${assignee.id}`;
      if (seenInFile.has(key)) warnings.push('Same title and assignee appear earlier in this file.');
      else if (existingKeys.has(key)) warnings.push(`${assignee.name} already has an open task with this title.`);
      seenInFile.add(key);
    }

    const description = readField(row, 'description') || null;
    const expectedOutcome = readField(row, 'expectedOutcome') || null;

    results.push({
      row: index + 1,
      status: errors.length ? 'blocked' : 'ready',
      errors,
      warnings,
      missingBeforeStart: errors.length ? [] : missingBeforeStart,
      resolved: {
        title,
        assignee: assignee && { id: assignee.id, name: assignee.name, email: assignee.email },
        department,
        project,
        description,
        expectedOutcome,
        priority,
        startDate: startDate?.toISOString() ?? null,
        dueDate: dueDate?.toISOString() ?? null,
        recurrence,
      },
    });
  }

  // ── Commit ──
  if (!dryRun) {
    const importable = results.filter((result) => result.status === 'ready');
    for (const result of importable) {
      const { resolved } = result;
      try {
        const task = await prisma.task.create({
          data: {
            orgId,
            assignedByUserId: actorUserId,
            title: resolved.title,
            description: resolved.description,
            expectedOutcome: resolved.expectedOutcome,
            priority: resolved.priority,
            // The recurrence worker scans `recurrence: { not: null }`; storing a
            // literal 'NONE' would drag every one-off task through that sweep.
            recurrence: resolved.recurrence === 'NONE' ? null : resolved.recurrence,
            assigneeUserId: resolved.assignee?.id,
            departmentId: resolved.department?.id,
            teamId: resolved.project?.id,
            startDate: resolved.startDate ? new Date(resolved.startDate) : null,
            dueDate: resolved.dueDate ? new Date(resolved.dueDate) : null,
            sourceType: 'IMPORT',
          },
          select: { id: true },
        });
        result.status = 'imported';
        result.taskId = task.id;
      } catch (error) {
        result.status = 'blocked';
        result.errors.push(`Couldn't save this row: ${(error as Error).message}`);
      }
    }

    await notifyAssignees(results, actorUserId);
  }

  const summary = {
    total: rows.length,
    ready: results.filter((result) => result.status === 'ready').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
    imported: results.filter((result) => result.status === 'imported').length,
    withWarnings: results.filter((result) => result.warnings.length > 0).length,
    needsDates: results.filter((result) => result.missingBeforeStart.length > 0).length,
    truncated: Math.max(0, truncated),
  };

  return {
    timeZone,
    dayFirst,
    dryRun,
    summary,
    rows: results,
    created: summary.imported,
    errors: results
      .filter((result) => result.errors.length)
      .map((result) => `Row ${result.row}: ${result.errors.join(' ')}`),
  };
}

/**
 * One notification per person, not one per task — a 200-row sheet should not
 * bury someone's notification list. The count of date-less tasks rides along so
 * the assignee knows up front that some of them need filling in before they can
 * be started.
 */
async function notifyAssignees(results: ImportRowResult[], actorUserId: string) {
  const byAssignee = new Map<string, ImportRowResult[]>();
  for (const result of results) {
    const assigneeId = result.resolved.assignee?.id;
    if (result.status !== 'imported' || !assigneeId || assigneeId === actorUserId) continue;
    const bucket = byAssignee.get(assigneeId);
    if (bucket) bucket.push(result);
    else byAssignee.set(assigneeId, [result]);
  }
  if (byAssignee.size === 0) return;

  const importer = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { name: true },
  });

  await Promise.all(
    [...byAssignee.entries()].map(([assigneeId, tasks]) =>
      createNotification(assigneeId, 'TASKS_IMPORTED', {
        count: tasks.length,
        taskTitle: tasks[0].resolved.title,
        needsDates: tasks.filter((task) => task.missingBeforeStart.length > 0).length,
        importedByName: importer?.name ?? 'Your manager',
      }).catch(console.error),
    ),
  );
}
