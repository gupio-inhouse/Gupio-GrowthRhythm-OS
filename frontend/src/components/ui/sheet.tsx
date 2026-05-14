import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Sheet({ open, onClose, children, className }: SheetProps) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className={cn(
        'fixed right-0 top-0 h-full bg-background border-l shadow-xl z-50 flex flex-col',
        'w-full sm:w-[560px]',
        className
      )}>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </>
  );
}

export function SheetHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-6 pt-6 pb-4 border-b', className)}>{children}</div>;
}

export function SheetTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold pr-8', className)}>{children}</h2>;
}

export function SheetContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex-1 overflow-y-auto px-6 py-4', className)}>{children}</div>;
}
