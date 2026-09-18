import { useState } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameDay, parseISO, isValid,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WeekdayDatePickerProps {
  value: string;                      // YYYY-MM-DD or ''
  onChange: (date: string) => void;   // emits YYYY-MM-DD
  excludeSat?: boolean;               // true for Engineering dept
  placeholder?: string;
  minDate?: string;                   // YYYY-MM-DD
  className?: string;
  inputClassName?: string;
  align?: 'start' | 'center' | 'end';
}

export function WeekdayDatePicker({
  value,
  onChange,
  excludeSat = false,
  placeholder = 'Pick date',
  minDate,
  className,
  inputClassName,
  align = 'start',
}: WeekdayDatePickerProps) {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const selected = value && isValid(parseISO(value)) ? parseISO(value) : null;

  const [open,      setOpen]      = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => selected ?? today);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd   = endOfMonth(viewMonth);
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad   = getDay(monthStart); // 0 = Sun
  const minD       = minDate && isValid(parseISO(minDate)) ? parseISO(minDate) : null;

  function isDisabled(d: Date): boolean {
    const day = getDay(d);
    if (day === 0) return true;
    if (minD && d < minD) return true;
    return false;
  }

  function handleSelect(d: Date) {
    if (isDisabled(d)) return;
    onChange(format(d, 'yyyy-MM-dd'));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 h-9 px-3 rounded-xl border text-xs font-medium bg-white transition-all focus:outline-none focus:ring-1 focus:ring-indigo-300 whitespace-nowrap',
            selected
              ? 'border-indigo-400 text-indigo-700 bg-indigo-50'
              : 'border-border/60 text-muted-foreground hover:border-indigo-200 hover:text-foreground',
            inputClassName,
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>{selected ? format(selected, 'dd MMM yyyy') : placeholder}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className={cn('w-auto p-3 rounded-2xl shadow-xl border border-border/60 bg-white', className)}
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3 gap-4">
          <button
            type="button"
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold select-none">{format(viewMonth, 'MMMM yyyy')}</span>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((d) => {
            const isSun   = d === 'Sun';
            const blocked = isSun;
            return (
              <div
                key={d}
                className={cn(
                  'text-center text-[10px] font-bold pb-1.5',
                  blocked ? 'text-red-400 line-through opacity-60' : 'text-muted-foreground',
                )}
              >
                {d}
              </div>
            );
          })}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}

          {days.map((d) => {
            const disabled   = isDisabled(d);
            const isToday    = isSameDay(d, today);
            const isSelected = selected ? isSameDay(d, selected) : false;

            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(d)}
                className={cn(
                  'h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-xs font-medium transition-all select-none',
                  isSelected && 'bg-indigo-600 text-white shadow-sm',
                  !isSelected && isToday && !disabled && 'ring-1 ring-indigo-400 text-indigo-700 font-bold',
                  !isSelected && !disabled && 'hover:bg-indigo-50 hover:text-indigo-700',
                  disabled && 'opacity-25 cursor-not-allowed text-red-400 line-through',
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        {/* Clear + legend */}
        <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            <span className="line-through text-red-400 opacity-60 mr-1">00</span>
            = Sun disabled
          </span>
          {selected && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-[10px] font-semibold text-muted-foreground hover:text-red-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
