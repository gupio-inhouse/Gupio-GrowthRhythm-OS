import { useEffect, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToasts, dismiss, type ToastVariant } from '@/hooks/use-toast';

// ── Variant config ─────────────────────────────────────────────────────────────
const VARIANTS: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; accent: string; iconCls: string; bg: string }
> = {
  success: {
    icon: CheckCircle2,
    accent: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
    iconCls: 'text-emerald-500',
    bg: 'bg-white',
  },
  error: {
    icon: AlertCircle,
    accent: 'bg-gradient-to-b from-red-400 to-red-600',
    iconCls: 'text-red-500',
    bg: 'bg-white',
  },
  warning: {
    icon: AlertTriangle,
    accent: 'bg-gradient-to-b from-amber-400 to-amber-600',
    iconCls: 'text-amber-500',
    bg: 'bg-white',
  },
  info: {
    icon: Info,
    accent: 'bg-gradient-to-b from-indigo-400 to-indigo-600',
    iconCls: 'text-indigo-500',
    bg: 'bg-white',
  },
  default: {
    icon: Bell,
    accent: 'bg-gradient-to-b from-slate-400 to-slate-600',
    iconCls: 'text-slate-500',
    bg: 'bg-white',
  },
};

// ── Progress bar — shrinks from 100% → 0% over `duration` ms ──────────────────
function ProgressBar({ duration, accent }: { duration: number; accent: string }) {
  const [width, setWidth] = useState(100);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(0));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="h-[3px] w-full bg-black/5 rounded-full overflow-hidden mt-3">
      <div
        className={cn('h-full rounded-full', accent)}
        style={{
          width: `${width}%`,
          transition: `width ${duration}ms linear`,
        }}
      />
    </div>
  );
}

// ── Single Toast ───────────────────────────────────────────────────────────────
function PremiumToast({
  id, title, description, variant = 'default', duration = 4500,
}: {
  id: string; title: string; description?: string;
  variant?: ToastVariant; duration?: number;
}) {
  const v = VARIANTS[variant];
  const Icon = v.icon;

  return (
    <ToastPrimitive.Root
      duration={duration}
      onOpenChange={(open) => { if (!open) dismiss(id); }}
      className={cn(
        'group relative flex w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-black/[0.06]',
        'shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18),0_2px_8px_-2px_rgba(0,0,0,0.08)]',
        v.bg,
        // Enter animation
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2 data-[state=open]:fade-in-0 data-[state=open]:duration-300',
        // Exit animation
        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=closed]:fade-out-0 data-[state=closed]:duration-200',
        // Swipe
        'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
        'data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full',
      )}
    >
      {/* Left accent bar */}
      <div className={cn('w-1 shrink-0 self-stretch rounded-l-2xl', v.accent)} />

      {/* Content */}
      <div className="flex-1 px-4 pt-4 pb-3 min-w-0">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn('mt-0.5 shrink-0', v.iconCls)}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 pr-6">
            <ToastPrimitive.Title className="text-sm font-semibold text-foreground leading-snug">
              {title}
            </ToastPrimitive.Title>
            {description && (
              <ToastPrimitive.Description className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                {description}
              </ToastPrimitive.Description>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar duration={duration} accent={v.accent} />
      </div>

      {/* Close button */}
      <ToastPrimitive.Close
        className={cn(
          'absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-lg',
          'text-muted-foreground/50 transition-all',
          'opacity-0 group-hover:opacity-100',
          'hover:bg-black/5 hover:text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:opacity-100',
        )}
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

// ── Toaster — mount once in App.tsx ───────────────────────────────────────────
export function Toaster() {
  const { toasts } = useToasts();

  return (
    <ToastPrimitive.Provider swipeDirection="up">
      {toasts.map((t) => (
        <PremiumToast key={t.id} {...t} />
      ))}

      <ToastPrimitive.Viewport
        className={cn(
          'fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 outline-none',
          'w-[360px] max-w-[calc(100vw-2rem)]',
          '[&>li]:list-none',
        )}
      />
    </ToastPrimitive.Provider>
  );
}
