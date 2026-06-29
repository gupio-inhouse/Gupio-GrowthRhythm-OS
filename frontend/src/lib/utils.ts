import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(date));
}

export function formatRelative(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(date);
}

export function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export function priorityColor(priority: string) {
  const map: Record<string, string> = {
    CRITICAL: 'text-red-600 bg-red-50 border-red-200',
    HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
    MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    LOW: 'text-green-600 bg-green-50 border-green-200',
  };
  return map[priority] || 'text-gray-600 bg-gray-50';
}

export function statusColor(status: string) {
  const map: Record<string, string> = {
    TODO: 'text-gray-600 bg-gray-100',
    IN_PROGRESS: 'text-blue-600 bg-blue-50',
    BLOCKED: 'text-red-600 bg-red-50',
    IN_REVIEW: 'text-amber-700 bg-amber-50',
    DONE: 'text-green-600 bg-green-50',
    CANCELLED: 'text-gray-400 bg-gray-50',
  };
  return map[status] || 'text-gray-600 bg-gray-100';
}

// ── Working-day helpers ───────────────────────────────────────────────────────
// Engineering dept: Sat + Sun are non-working. All other depts: Sun only.

export function isEngineeringDept(name?: string): boolean {
  return !!name && name.toLowerCase().includes('engineering');
}

// Returns milliseconds of working time between start and end, skipping weekends.
export function calcWorkingMs(start: Date, end: Date, excludeSat: boolean): number {
  if (end <= start) return 0;
  let ms = 0;
  const d = new Date(start); d.setHours(0, 0, 0, 0);
  while (d.getTime() < end.getTime()) {
    const day = d.getDay();
    if (day !== 0 && !(excludeSat && day === 6)) {
      const dayEnd = new Date(d); dayEnd.setDate(d.getDate() + 1);
      const s = Math.max(d.getTime(), start.getTime());
      const e = Math.min(dayEnd.getTime(), end.getTime());
      if (e > s) ms += e - s;
    }
    d.setDate(d.getDate() + 1);
  }
  return ms;
}

// Human label from working ms (e.g. "2d 3h", "5h", "10d").
export function workingDurationLabel(start: Date, end: Date, excludeSat: boolean): string | null {
  const ms = calcWorkingMs(start, end, excludeSat);
  if (ms <= 0) return null;
  const totalHours = Math.floor(ms / 3_600_000);
  const days       = Math.floor(ms / 86_400_000);
  const remHours   = totalHours - days * 24;
  if (totalHours < 24) return `${totalHours}h`;
  if (remHours > 0 && days < 7) return `${days}d ${remHours}h`;
  return `${days}d`;
}

// If dateStr falls on a non-working day, advance to the next working day.
export function snapToWorkingDay(dateStr: string, excludeSat: boolean): string {
  const d = new Date(dateStr + 'T00:00:00');
  while (d.getDay() === 0 || (excludeSat && d.getDay() === 6)) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

// Count working days between two dates (positive = from < to, negative = from > to).
export function countWorkingDays(from: Date, to: Date, excludeSat: boolean): number {
  const sign  = to < from ? -1 : 1;
  const start = new Date(sign === 1 ? from : to); start.setHours(0, 0, 0, 0);
  const end   = new Date(sign === 1 ? to   : from); end.setHours(0, 0, 0, 0);
  let count = 0;
  const d = new Date(start);
  while (d < end) {
    const day = d.getDay();
    if (day !== 0 && !(excludeSat && day === 6)) count++;
    d.setDate(d.getDate() + 1);
  }
  return sign * count;
}

