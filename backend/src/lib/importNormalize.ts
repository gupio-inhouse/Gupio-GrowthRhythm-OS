/**
 * Forgiving normalisation for bulk task imports.
 *
 * People uploading a task sheet don't know the schema. Headers arrive as "Task
 * Name" / "Who" / "By When", priorities as "p1" or "urgent" or "3", and dates in
 * whatever format their spreadsheet locale emits. Everything in here turns that
 * human input into the canonical shape the task API expects, and reports what it
 * had to guess so the importer can show a warning instead of silently inventing
 * data.
 *
 * Only `title` and `assignee` are ever hard requirements — every other field
 * degrades to a default plus a warning. Tasks that land missing their dates are
 * held at TODO by the status gate in routes/tasks.ts until someone fills them in.
 */

// Working-hours window the app enforces on manually created tasks; date-only
// cells get anchored to it rather than to midnight.
export const WORK_START_TIME = '09:30';
export const WORK_END_TIME = '19:30';

export const CANONICAL_FIELDS = [
  'title',
  'assignee',
  'description',
  'expectedOutcome',
  'department',
  'project',
  'priority',
  'startDate',
  'dueDate',
  'recurrence',
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export const REQUIRED_FIELDS: CanonicalField[] = ['title', 'assignee'];

export const FIELD_LABELS: Record<CanonicalField, string> = {
  title: 'Task title',
  assignee: 'Assignee',
  description: 'Description',
  expectedOutcome: 'Expected outcome',
  department: 'Department',
  project: 'Project',
  priority: 'Priority',
  startDate: 'Start date',
  dueDate: 'End date',
  recurrence: 'Recurrence',
};

/**
 * Header spellings we accept for each field. Matching is done on the squashed
 * form (lowercase, alphanumerics only), so "Task Name", "task_name" and
 * "TASK-NAME" all collapse to the same key and only need listing once.
 */
export const HEADER_SYNONYMS: Record<CanonicalField, string[]> = {
  title: [
    'title', 'task', 'taskname', 'tasktitle', 'name', 'work', 'workitem', 'item',
    'summary', 'subject', 'activity', 'todo', 'todoitem', 'action', 'actionitem',
    'story', 'ticket', 'issue', 'whattodo', 'what', 'requirement', 'feature',
  ],
  assignee: [
    'assignee', 'assigneeemail', 'assignedto', 'assignto', 'assigned', 'owner',
    'ownername', 'email', 'emailid', 'emailaddress', 'user', 'username', 'person',
    'personresponsible', 'responsible', 'responsibleperson', 'who', 'whom',
    'whoisdoingit', 'doer', 'member', 'teammember', 'employee', 'staff', 'resource',
    'allocatedto', 'assigneename', 'assignedperson', 'developer', 'engineer', 'poc',
  ],
  description: [
    'description', 'desc', 'details', 'detail', 'notes', 'note', 'remarks', 'remark',
    'comment', 'comments', 'context', 'brief', 'scope', 'about', 'moreinfo',
    'additionalinfo', 'explanation', 'body',
  ],
  expectedOutcome: [
    'expectedoutcome', 'outcome', 'expectedresult', 'result', 'deliverable',
    'definitionofdone', 'dod', 'acceptancecriteria', 'successcriteria', 'goal',
    'objective', 'expected', 'output', 'expectedoutput',
  ],
  department: [
    'department', 'departmentname', 'dept', 'deptname', 'function', 'division',
    'unit', 'vertical', 'businessunit',
  ],
  project: [
    'project', 'projectname', 'projecttitle', 'team', 'teamname', 'initiative',
    'program', 'programme', 'epic', 'workstream', 'stream', 'client', 'account',
    'product', 'module',
  ],
  priority: [
    'priority', 'prio', 'priorities', 'importance', 'urgency', 'severity', 'sev',
    'level', 'criticality',
  ],
  startDate: [
    'startdate', 'start', 'startdatetime', 'startson', 'starton', 'begin',
    'begindate', 'fromdate', 'kickoff', 'plannedstart', 'startday',
    'dateofstart', 'startingdate', 'startingon', 'commencement',
  ],
  dueDate: [
    'duedate', 'due', 'deadline', 'enddate', 'end', 'enddatetime', 'endson',
    'endon', 'todate', 'target', 'targetdate', 'bywhen', 'completiondate',
    'finish', 'finishdate', 'expectedcompletion', 'lastdate',
    'delivery', 'deliverydate', 'dueby', 'duedatetime', 'closedate',
  ],
  recurrence: [
    'recurrence', 'recurring', 'recur', 'repeat', 'repeats', 'frequency', 'freq',
    'cadence', 'howoften',
  ],
};

/** Legacy wire names still accepted on the import payload. */
export const LEGACY_ROW_KEYS: Record<string, CanonicalField> = {
  assigneeEmail: 'assignee',
  departmentName: 'department',
  projectName: 'project',
};

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Squash a header to its comparable form: lowercase alphanumerics only. */
export function squash(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

const PLACEHOLDER_CELL = /^(n\/?a|nil|none|null|undefined|-{1,3}|_+|tbd|tba|\?+|#n\/a|#value!|#ref!)$/i;

/**
 * Trim a raw spreadsheet cell: strips the wrapping quotes CSV exports leave
 * behind, the non-breaking and zero-width spaces Excel and Google Sheets emit,
 * and the placeholder words people type when they mean "nothing here".
 */
export function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  text = text
    .replace(/[\u00a0\u202f\u2007]/g, ' ')      // non-breaking spaces
    .replace(/[\u200b-\u200d\ufeff]/g, '')      // zero-width marks and the BOM
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1).replace(/""/g, '"').trim();
  }
  if (PLACEHOLDER_CELL.test(text)) return '';
  return text;
}

/** Levenshtein distance between two short strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 0–1 similarity, 1 being identical. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

// ── Header mapping ────────────────────────────────────────────────────────────

export type HeaderMatch = {
  field: CanonicalField;
  /** 'exact' when the header is a known spelling, 'fuzzy' when we guessed. */
  confidence: 'exact' | 'fuzzy';
  score: number;
};

const EXACT_HEADER_INDEX: Map<string, CanonicalField> = (() => {
  const index = new Map<string, CanonicalField>();
  for (const field of CANONICAL_FIELDS) {
    index.set(squash(field), field);
    for (const synonym of HEADER_SYNONYMS[field]) {
      if (!index.has(squash(synonym))) index.set(squash(synonym), field);
    }
  }
  return index;
})();

/**
 * Best-effort map of one spreadsheet header to a task field.
 *
 * Tries an exact synonym hit, then containment ("who is the owner" → assignee),
 * then edit distance for typos ("descrption" → description). Returns null when
 * nothing is close enough — the caller then asks the uploader to map it by hand
 * rather than guessing wrong.
 */
export function matchHeader(rawHeader: string): HeaderMatch | null {
  const key = squash(rawHeader);
  if (!key) return null;

  const exact = EXACT_HEADER_INDEX.get(key);
  if (exact) return { field: exact, confidence: 'exact', score: 1 };

  let best: HeaderMatch | null = null;
  for (const field of CANONICAL_FIELDS) {
    for (const synonym of [field, ...HEADER_SYNONYMS[field]]) {
      const candidate = squash(synonym);
      if (candidate.length < 4) continue;

      let score = 0;
      if (key.includes(candidate) || candidate.includes(key)) {
        // Longer overlaps are more convincing: "duedatefinal" → dueDate beats a
        // short coincidental substring.
        const ratio = Math.min(key.length, candidate.length) / Math.max(key.length, candidate.length);
        score = 0.72 + 0.25 * ratio;
      } else {
        const sim = similarity(key, candidate);
        if (sim >= 0.8) score = sim * 0.9;
      }

      if (score > 0 && (!best || score > best.score)) {
        best = { field, confidence: 'fuzzy', score };
      }
    }
  }
  return best && best.score >= 0.72 ? best : null;
}

/**
 * Map a whole header row, resolving collisions so two columns never claim the
 * same field — the stronger match wins and the loser is left unmapped for the
 * uploader to assign by hand.
 */
export function mapHeaders(headers: string[]): (HeaderMatch | null)[] {
  const matches = headers.map((header) => matchHeader(header));
  const claimed = new Map<CanonicalField, number>();

  matches.forEach((match, index) => {
    if (!match) return;
    const holder = claimed.get(match.field);
    if (holder === undefined) {
      claimed.set(match.field, index);
      return;
    }
    const incumbent = matches[holder]!;
    if (match.score > incumbent.score) {
      matches[holder] = null;
      claimed.set(match.field, index);
    } else {
      matches[index] = null;
    }
  });

  return matches;
}

/**
 * Does this row look like a header row, or is it already data? Hand-rolled
 * sheets often start straight at row 1 with no header at all.
 */
export function looksLikeHeaderRow(cells: string[]): boolean {
  const filled = cells.map(normalizeCell).filter(Boolean);
  if (filled.length === 0) return false;
  // Header rows are short labels that mostly resolve to known fields; data rows
  // hold sentences, emails and dates, which resolve to nothing.
  const looksLabelled = filled.every((cell) => cell.length <= 40 && !cell.includes('@'));
  if (!looksLabelled) return false;
  const matched = filled.filter((cell) => matchHeader(cell) !== null).length;
  return matched / filled.length >= 0.4;
}

// ── Value coercion ────────────────────────────────────────────────────────────

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const PRIORITY_ALIASES: Record<string, Priority> = {
  low: 'LOW', lo: 'LOW', l: 'LOW', p4: 'LOW', '4': 'LOW', minor: 'LOW',
  trivial: 'LOW', nicetohave: 'LOW', backlog: 'LOW', lowest: 'LOW',

  medium: 'MEDIUM', med: 'MEDIUM', mid: 'MEDIUM', m: 'MEDIUM', p3: 'MEDIUM',
  '3': 'MEDIUM', normal: 'MEDIUM', standard: 'MEDIUM', moderate: 'MEDIUM',
  average: 'MEDIUM', regular: 'MEDIUM', default: 'MEDIUM',

  high: 'HIGH', hi: 'HIGH', h: 'HIGH', p2: 'HIGH', '2': 'HIGH', major: 'HIGH',
  important: 'HIGH', urgent: 'HIGH', asap: 'HIGH',

  critical: 'CRITICAL', crit: 'CRITICAL', p1: 'CRITICAL', p0: 'CRITICAL',
  '1': 'CRITICAL', '0': 'CRITICAL', blocker: 'CRITICAL', highest: 'CRITICAL',
  emergency: 'CRITICAL', showstopper: 'CRITICAL', veryhigh: 'CRITICAL',
  immediate: 'CRITICAL', severe: 'CRITICAL',
};

export function parsePriority(raw: string): Priority | null {
  const key = squash(raw);
  if (!key) return null;
  if (PRIORITY_ALIASES[key]) return PRIORITY_ALIASES[key];
  // Tolerate decorated forms: "High Priority", "P1 - Critical", "🔥 urgent".
  // Longest alias first so "veryhigh" isn't shadowed by "high".
  const decorated = Object.keys(PRIORITY_ALIASES)
    .filter((alias) => alias.length >= 3)
    .sort((a, b) => b.length - a.length)
    .find((alias) => key.includes(alias));
  return decorated ? PRIORITY_ALIASES[decorated] : null;
}

export type Recurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

const RECURRENCE_ALIASES: Record<string, Recurrence> = {
  none: 'NONE', no: 'NONE', once: 'NONE', onetime: 'NONE', oneoff: 'NONE',
  never: 'NONE', notrecurring: 'NONE', single: 'NONE', adhoc: 'NONE',

  daily: 'DAILY', day: 'DAILY', everyday: 'DAILY', perday: 'DAILY',
  eachday: 'DAILY',

  weekly: 'WEEKLY', week: 'WEEKLY', everyweek: 'WEEKLY', perweek: 'WEEKLY',
  eachweek: 'WEEKLY', biweekly: 'WEEKLY', fortnightly: 'WEEKLY',

  monthly: 'MONTHLY', month: 'MONTHLY', everymonth: 'MONTHLY',
  permonth: 'MONTHLY', eachmonth: 'MONTHLY', quarterly: 'MONTHLY',

  yearly: 'YEARLY', year: 'YEARLY', annual: 'YEARLY', annually: 'YEARLY',
  everyyear: 'YEARLY', peryear: 'YEARLY',
};

export function parseRecurrence(raw: string): Recurrence | null {
  const key = squash(raw);
  if (!key) return null;
  if (RECURRENCE_ALIASES[key]) return RECURRENCE_ALIASES[key];
  const decorated = Object.keys(RECURRENCE_ALIASES)
    .filter((alias) => alias.length >= 4)
    .sort((a, b) => b.length - a.length)
    .find((alias) => key.includes(alias));
  return decorated ? RECURRENCE_ALIASES[decorated] : null;
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export type DateParts = {
  /** Wall-clock parts; the caller decides which timezone they belong to. */
  year: number;
  month: number; // 0-indexed
  day: number;
  hour: number;
  minute: number;
  /** No time was present, so the working-hours default applies. */
  timeAssumed: boolean;
  /** Day/month order was genuinely ambiguous (e.g. 03/04/2026). */
  orderAssumed: boolean;
};

/**
 * Pull a clock time out of a cell. Only colon-separated times and bare am/pm
 * counts — dots are left alone because `15.07.2026` is a date, not 15:07.
 */
function parseTimePart(raw: string): { hour: number; minute: number } | null {
  const match = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?|(\d{1,2})\s*(am|pm)\b/i);
  if (!match) return null;

  let hour: number;
  let minute: number;
  let meridiem: string | undefined;

  if (match[4] !== undefined) {
    hour = Number(match[4]);
    minute = 0;
    meridiem = match[5];
  } else {
    hour = Number(match[1]);
    minute = Number(match[2]);
    meridiem = match[3];
  }

  if (meridiem) {
    const lower = meridiem.toLowerCase();
    if (lower === 'pm' && hour < 12) hour += 12;
    if (lower === 'am' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function expandYear(year: number): number {
  if (year >= 1000) return year;
  // Two-digit years: 70–99 → 1900s, everything else → 2000s.
  return year >= 70 ? 1900 + year : 2000 + year;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2200 || month < 0 || month > 11 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month && probe.getUTCDate() === day;
}

export type ParseDateOptions = {
  /** Order to assume for ambiguous numeric dates like 03/04/2026. */
  dayFirst?: boolean;
  /** Wall-clock "now", used for relative words and for a missing year. */
  today?: { year: number; month: number; day: number };
};

/**
 * Parse a date cell in whatever shape it arrived.
 *
 * Handles ISO strings, Excel serial numbers, `YYYYMMDD`, slash/dash/dot numerics
 * in either order, spelled-out months, and the relative words that show up in
 * hand-written sheets. Numeric dates that could go either way follow `dayFirst`
 * and come back flagged as assumed so the importer can warn.
 */
export function parseLooseDate(raw: string, options: ParseDateOptions = {}): DateParts | null {
  const text = normalizeCell(raw);
  if (!text) return null;

  const dayFirst = options.dayFirst ?? true;
  const now = options.today ?? (() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  })();

  const time = parseTimePart(text);
  const hour = time?.hour ?? 0;
  const minute = time?.minute ?? 0;
  const timeAssumed = time === null;

  const build = (year: number, month: number, day: number, orderAssumed = false): DateParts | null =>
    isRealDate(year, month, day)
      ? { year, month, day, hour, minute, timeAssumed, orderAssumed }
      : null;

  const shiftDays = (days: number): DateParts => {
    const shifted = new Date(Date.UTC(now.year, now.month, now.day + days));
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      day: shifted.getUTCDate(),
      hour, minute, timeAssumed, orderAssumed: false,
    };
  };

  const squashed = squash(text);
  if (squashed === 'today' || squashed === 'now') return shiftDays(0);
  if (squashed === 'tomorrow' || squashed === 'tmrw') return shiftDays(1);
  if (squashed === 'yesterday') return shiftDays(-1);
  if (squashed === 'nextweek') return shiftDays(7);
  if (squashed === 'nextmonth') return shiftDays(30);

  // Bare number: an Excel serial, or a packed YYYYMMDD.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const packed = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (packed) {
      const built = build(Number(packed[1]), Number(packed[2]) - 1, Number(packed[3]));
      if (built) return built;
    }
    const serial = Number(text);
    // Days since 1899-12-30, optionally with a fractional day for the time.
    if (serial >= 1 && serial <= 80000) {
      const whole = Math.floor(serial);
      const date = new Date(Date.UTC(1899, 11, 30) + whole * 86400000);
      const fraction = serial - whole;
      const fractionalMinutes = Math.round(fraction * 1440);
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
        hour: fraction > 0 ? Math.floor(fractionalMinutes / 60) : hour,
        minute: fraction > 0 ? fractionalMinutes % 60 : minute,
        timeAssumed: fraction === 0,
        orderAssumed: false,
      };
    }
    return null;
  }

  // ISO-ish, anywhere in the cell: 2026-07-15, 2026/07/15, 2026-07-15T09:30
  const iso = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const built = build(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (built) return built;
  }

  // Spelled-out month in either order: "15 Jul 2026", "Jul 15, 2026",
  // "Wednesday, 15 July". Scans every word so a leading weekday doesn't block it.
  const words = text.match(/[a-z]{3,9}/gi) ?? [];
  const monthWord = words.find((word) => MONTHS[word.toLowerCase()] !== undefined);
  if (monthWord) {
    const month = MONTHS[monthWord.toLowerCase()];
    const numbers = text
      .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
      .match(/\d{1,4}/g)
      ?.map(Number) ?? [];
    const day = numbers.find((n) => n >= 1 && n <= 31);
    const year = numbers.find((n) => n >= 1000) ?? now.year;
    if (day !== undefined) {
      const built = build(year, month, day);
      if (built) return built;
    }
    return null;
  }

  // Numeric with separators: 15/07/2026, 07-15-26, 15.07.2026
  const numeric = text.match(/(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = expandYear(Number(numeric[3]));

    // An out-of-range value settles the order on its own.
    if (first > 12 && second <= 12) return build(year, second - 1, first);
    if (second > 12 && first <= 12) return build(year, first - 1, second);
    if (first > 12 && second > 12) return null;

    return dayFirst
      ? build(year, second - 1, first, first !== second)
      : build(year, first - 1, second, first !== second);
  }

  return null;
}

// ── Timezone-correct instants ─────────────────────────────────────────────────

/** How far `timeZone` is ahead of UTC, in ms, at the given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant;
}

export function isValidTimeZone(timeZone: string | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Turn wall-clock parts into a real instant, interpreting them in `timeZone`.
 *
 * Manually created tasks get their ISO from the browser, i.e. in the user's own
 * zone. Imports are normalised server-side, so the uploader's zone rides along
 * on the request and is applied here — otherwise a 9:30 AM IST start would land
 * in the database as 9:30 AM UTC and show up five and a half hours late.
 */
export function partsToInstant(
  parts: Pick<DateParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
  timeZone: string,
): Date {
  const wallClock = Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute);
  // Two passes: the first offset is read at the wrong instant near DST changes,
  // the second lands on the right side of the transition.
  let instant = wallClock - zoneOffsetMs(wallClock, timeZone);
  instant = wallClock - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
}

/**
 * Clamp parsed parts into the app's working-hours window, the same rule the
 * manual Add Task form applies, and hand back the instant plus whether we had
 * to move a time the uploader actually specified.
 */
export function toWorkingHoursInstant(
  parts: DateParts,
  bound: 'start' | 'end',
  timeZone: string,
): { date: Date; clamped: boolean } {
  const [startHour, startMinute] = WORK_START_TIME.split(':').map(Number);
  const [endHour, endMinute] = WORK_END_TIME.split(':').map(Number);

  let { hour, minute } = parts;
  let clamped = false;

  if (parts.timeAssumed) {
    // A date-only cell anchors to the natural edge of the working day.
    [hour, minute] = bound === 'end' ? [endHour, endMinute] : [startHour, startMinute];
  } else {
    const asMinutes = hour * 60 + minute;
    if (asMinutes < startHour * 60 + startMinute) {
      [hour, minute] = [startHour, startMinute];
      clamped = true;
    } else if (asMinutes > endHour * 60 + endMinute) {
      [hour, minute] = [endHour, endMinute];
      clamped = true;
    }
  }

  return { date: partsToInstant({ ...parts, hour, minute }, timeZone), clamped };
}

// ── Reference resolution ──────────────────────────────────────────────────────

export type NamedRecord = { id: string; name: string };

export type ResolveResult<T> = {
  match: T | null;
  /** 'exact' — unambiguous hit. 'fuzzy' — close enough but worth flagging. */
  confidence: 'exact' | 'fuzzy' | 'none';
  /** Populated when several records were equally plausible. */
  ambiguous: T[];
};

const NO_MATCH = { match: null, confidence: 'none' as const, ambiguous: [] };

/**
 * Resolve a typed-in name against a list of records: exact (case-insensitive)
 * first, then unique prefix/substring, then closest spelling. Ambiguity is
 * reported rather than resolved — picking one at random is worse than asking.
 */
export function resolveByName<T extends NamedRecord>(raw: string, records: T[]): ResolveResult<T> {
  const key = squash(raw);
  if (!key) return NO_MATCH;

  const exact = records.filter((record) => squash(record.name) === key);
  if (exact.length === 1) return { match: exact[0], confidence: 'exact', ambiguous: [] };
  if (exact.length > 1) return { match: null, confidence: 'none', ambiguous: exact };

  const contains = records.filter((record) => {
    const candidate = squash(record.name);
    return candidate.length >= 3 && (candidate.includes(key) || key.includes(candidate));
  });
  if (contains.length === 1) return { match: contains[0], confidence: 'fuzzy', ambiguous: [] };
  if (contains.length > 1) return { match: null, confidence: 'none', ambiguous: contains };

  const scored = records
    .map((record) => ({ record, score: similarity(key, squash(record.name)) }))
    .filter((entry) => entry.score >= 0.8)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return NO_MATCH;
  // A clear winner only counts if it's meaningfully ahead of the runner-up.
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.05) {
    return { match: null, confidence: 'none', ambiguous: scored.slice(0, 4).map((entry) => entry.record) };
  }
  return { match: scored[0].record, confidence: 'fuzzy', ambiguous: [] };
}

export type PersonRecord = { id: string; name: string; email: string };

/**
 * Resolve an assignee cell that might hold an email, a full name, a first name,
 * or "Priya Sharma <priya@co.com>". Email wins when present because it's exact.
 */
export function resolvePerson(raw: string, people: PersonRecord[]): ResolveResult<PersonRecord> {
  const text = normalizeCell(raw);
  if (!text) return NO_MATCH;

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) {
    const email = emailMatch[0].toLowerCase();
    const byEmail = people.find((person) => person.email.toLowerCase() === email);
    if (byEmail) return { match: byEmail, confidence: 'exact', ambiguous: [] };

    // Right person, wrong domain — common when someone types it from memory.
    const localPart = email.split('@')[0];
    const byLocal = people.filter((person) => person.email.toLowerCase().split('@')[0] === localPart);
    if (byLocal.length === 1) return { match: byLocal[0], confidence: 'fuzzy', ambiguous: [] };
    if (byLocal.length > 1) return { match: null, confidence: 'none', ambiguous: byLocal };

    // "Priya Sharma <wrong@address>" — fall back to the name beside the address.
    const withoutEmail = text.replace(emailMatch[0], '').replace(/[<>()]/g, '').trim();
    return withoutEmail ? resolveByName(withoutEmail, people) : NO_MATCH;
  }

  const byName = resolveByName(text, people);
  if (byName.match || byName.ambiguous.length) return byName;

  // Last resort: a single first-name hit ("Priya" when only one Priya exists).
  const first = squash(text.split(/\s+/)[0]);
  if (first.length >= 3) {
    const byFirstName = people.filter((person) => squash(person.name.split(/\s+/)[0]) === first);
    if (byFirstName.length === 1) return { match: byFirstName[0], confidence: 'fuzzy', ambiguous: [] };
    if (byFirstName.length > 1) return { match: null, confidence: 'none', ambiguous: byFirstName };
  }

  return NO_MATCH;
}
