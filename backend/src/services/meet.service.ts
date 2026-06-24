import prisma from '../lib/prisma';
import { decrypt } from './crypto.service';
import { randomUUID } from 'crypto';

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
// Returns a Google Meet URL if Google Calendar is connected, otherwise null.
export async function generateMeetUrl(
  orgId: string,
  _deptSlug: string,
  deptName: string,
  scheduledAt: Date,
  durationMinutes = 15
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = await (prisma as any).oAuthToken.findUnique({
      where: { orgId_provider: { orgId, provider: 'google' } },
    });

    if (!token) return null;

    const accessToken = decrypt(token.accessToken);
    return await createGoogleMeetViaCalendar(accessToken, deptName, scheduledAt, durationMinutes);
  } catch {
    return null;
  }
}
