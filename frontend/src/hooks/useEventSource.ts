import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';

// M6.4: SSE realtime updates hook
// Connects to /api/events and invalidates relevant queries on events
export function useRealtimeUpdates() {
  const { token } = useAuthStore();
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token) return;

    // EventSource doesn't support custom headers — pass token as query param
    const url = `/api/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('task_updated', () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    });

    es.addEventListener('standup_updated', () => {
      qc.invalidateQueries({ queryKey: ['standups'] });
    });

    es.addEventListener('notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });

    es.addEventListener('kra_updated', () => {
      qc.invalidateQueries({ queryKey: ['kras'] });
    });

    es.onerror = () => {
      // Browser auto-reconnects on SSE error; no manual retry needed
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [token, qc]);
}
