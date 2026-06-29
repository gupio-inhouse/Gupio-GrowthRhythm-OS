import { useEffect, useState } from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

// ── Module-level store so toast() works outside React components ───────────────
let _seq = 0;
const _store: ToastItem[] = [];
const _listeners = new Set<(t: ToastItem[]) => void>();

function _emit() {
  const snap = [..._store];
  _listeners.forEach((fn) => fn(snap));
}

export function dismiss(id: string) {
  const i = _store.findIndex((t) => t.id === id);
  if (i !== -1) { _store.splice(i, 1); _emit(); }
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function toast(opts: Omit<ToastItem, 'id'>) {
  const id = String(++_seq);
  _store.push({ duration: 4500, variant: 'default', ...opts, id });
  _emit();
  return id;
}

toast.success = (title: string, description?: string) =>
  toast({ title, description, variant: 'success' });

toast.error = (title: string, description?: string) =>
  toast({ title, description, variant: 'error', duration: 7000 });

toast.warning = (title: string, description?: string) =>
  toast({ title, description, variant: 'warning' });

toast.info = (title: string, description?: string) =>
  toast({ title, description, variant: 'info' });

// ── Hook for Toaster component ─────────────────────────────────────────────────
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([..._store]);
  useEffect(() => {
    _listeners.add(setToasts);
    return () => { _listeners.delete(setToasts); };
  }, []);
  return { toasts, dismiss };
}
