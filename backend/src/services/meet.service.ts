import prisma from '../lib/prisma';
import { decrypt } from './crypto.service';
import { randomUUID } from 'crypto';

// Build a deterministic Jitsi room URL — works without any OAuth
function jitsiUrl(deptSlug: string, dateStr: string): string {
  const room = `GRStandup-${deptSlug}-${dateStr}`.replace(/[^a-zA-Z0-9-]/g, '-');
  return `https://meet.jit.si/${room}`;
}

// Use Google Calendar API to create a Calendar event with a built-in Meet conference.
// Returns the Google Meet URL (hangoutLink), or null if creation fails.
async function createGoogleMeetViaCalendar(
  accessToken: string,
  deptName: string,
  scheduledAt: Date,
  durationMinutes: number
): Promise<string | null> {
  const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
  const requestId = randomUUID();

  const event = {
    summary: `${deptName} — Daily Standup`,
    description: 'GrowthRhythm OS daily 15-minute standup',
    start: { dateTime: scheduledAt.toISOString(), timeZone: 'Asia/Kolkata' },
    end: { dateTime: endAt.toISOString(), timeZone: 'Asia/Kolkata' },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!res.ok) return null;

    const data = await res.json() as { hangoutLink?: string };
    return data.hangoutLink ?? null;
  } catch {
    return null;
  }
}

// Main entry point — called when a standup is being created.
// Returns a Google Meet URL (from Calendar API if connected, else Jitsi fallback).
export async function generateMeetUrl(
  orgId: string,
  deptSlug: string,
  deptName: string,
  scheduledAt: Date,
  durationMinutes = 15
): Promise<string> {
  const dateStr = scheduledAt.toISOString().slice(0, 10).replace(/-/g, '');

  // Try Google Calendar API if the org has a connected token
  try {
    const token = await prisma.oAuthToken.findUnique({
      where: { orgId_provider: { orgId, provider: 'google' } },
    });

    if (token) {
      const accessToken = decrypt(token.accessToken);
      const meetUrl = await createGoogleMeetViaCalendar(
        accessToken,
        deptName,
        scheduledAt,
        durationMinutes
      );
      if (meetUrl) return meetUrl;
    }
  } catch {
    // Fall through to Jitsi
  }

  return jitsiUrl(deptSlug, dateStr);
}
