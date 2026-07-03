import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { learningApi } from '@/api/learning';

const BEAT_SECONDS = 15;

/**
 * Accrues watch time for the open lesson by posting a heartbeat every 15s.
 * Beats are skipped while the tab is hidden, so time only counts when the
 * learner actually has the lesson on screen. The server increments (never
 * replaces) the stored total, capping each beat, so a stuck or malicious
 * client can't inflate time faster than real time.
 */
export function useWatchHeartbeat(lessonId: string | undefined, enrollmentId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!lessonId || !enrollmentId) return;

    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      learningApi.sendHeartbeat(lessonId, enrollmentId, BEAT_SECONDS).catch(() => {
        // Losing a beat is fine — watch time is best-effort telemetry.
      });
    }, BEAT_SECONDS * 1000);

    return () => {
      clearInterval(id);
      qc.invalidateQueries({ queryKey: ['learning:stats'] });
    };
  }, [lessonId, enrollmentId, qc]);
}
