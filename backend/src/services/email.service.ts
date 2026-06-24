import nodemailer, { Transporter } from 'nodemailer';
import { MagicLinkPurpose } from '@prisma/client';
import type { Queue } from 'bullmq';

// Injected at startup to avoid circular deps — set by worker init
let _emailQueue: Queue | null = null;
export function setEmailQueue(q: Queue) { _emailQueue = q; }

// ─── Nodemailer transporter ───────────────────────────────────────────────────
// Supports any SMTP provider via env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Common presets:
//   Gmail:      host=smtp.gmail.com  port=587  (use App Password)
//   Outlook:    host=smtp.office365.com  port=587
//   Zoho:       host=smtp.zoho.in  port=587
//   Brevo:      host=smtp-relay.brevo.com  port=587
//   Mailtrap:   host=sandbox.smtp.mailtrap.io  port=2525  (dev testing)

let transporter: Transporter | null = null;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || SMTP_USER || 'noreply@growthrhythm.app';
const FROM_NAME = process.env.SMTP_FROM_NAME || 'GrowthRhythm OS';

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ─── Generic send ────────────────────────────────────────────────────────────

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<boolean> {
  if (!transporter) {
    console.log('[email.service] DEV MODE — SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:    ${(text ?? html.replace(/<[^>]+>/g, ' ').trim()).slice(0, 300)}`);
    return false;
  }

  // Use BullMQ queue for retry resilience when available
  if (_emailQueue) {
    await _emailQueue.add('send', { to, subject, html, text });
    return true;
  }

  // Fallback: send directly (e.g. during tests or early startup)
  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });
  return true;
}

// Called by emailWorker to actually deliver the message
export async function deliverEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
  if (!transporter) throw new Error('SMTP not configured');
  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });
}

// ─── Magic link email ────────────────────────────────────────────────────────

const PURPOSE_CONFIG: Record<MagicLinkPurpose, { subject: string; heading: string; buttonLabel: string; intro: string }> = {
  COMPANY_ONBOARDING: {
    subject: 'Welcome to GrowthRhythm OS — Set up your workspace',
    heading: 'Your workspace is ready',
    buttonLabel: 'Set Up My Workspace',
    intro: 'You have been invited to set up your organisation on GrowthRhythm OS. Click the button below to get started.',
  },
  DEPARTMENT_HEAD_INVITE: {
    subject: 'You have been invited as Department Head — GrowthRhythm OS',
    heading: 'You are invited as Department Head',
    buttonLabel: 'Accept Invitation',
    intro: 'You have been invited to join GrowthRhythm OS as a Department Head. Click the button below to accept your invitation and set up your account.',
  },
  MEMBER_INVITE: {
    subject: 'You have been invited to join GrowthRhythm OS',
    heading: 'You have been invited',
    buttonLabel: 'Accept Invitation',
    intro: 'You have been invited to join your team on GrowthRhythm OS. Click the button below to accept and get started.',
  },
  DAILY_STANDUP: {
    subject: 'Your daily standup is ready — GrowthRhythm OS',
    heading: 'Time for your standup',
    buttonLabel: 'Submit My Standup',
    intro: 'Your daily standup is ready. Click the button below to submit your update — it only takes a minute.',
  },
  PASSWORD_RESET: {
    subject: 'Reset your GrowthRhythm OS password',
    heading: 'Reset your password',
    buttonLabel: 'Reset My Password',
    intro: 'We received a request to reset your password. Click the button below. This link expires in 1 hour.',
  },
};

interface SendMagicLinkEmailParams {
  to: string;
  name: string;
  magicLinkUrl: string;
  purpose: MagicLinkPurpose;
}

export async function sendMagicLinkEmail({ to, name, magicLinkUrl, purpose }: SendMagicLinkEmailParams): Promise<boolean> {
  const config = PURPOSE_CONFIG[purpose];
  const firstName = name.split(' ')[0];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;">
                    <span style="font-size:22px;line-height:44px;">&#9889;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p>
                    <p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">${config.heading}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
                Hi ${firstName},<br/><br/>${config.intro}
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="${magicLinkUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                      ${config.buttonLabel}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Or copy this link into your browser:</p>
              <p style="margin:0 0 28px;font-size:12px;color:#475569;word-break:break-all;background-color:#0f172a;padding:12px;border-radius:8px;font-family:monospace;">
                ${magicLinkUrl}
              </p>
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;" />
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
                This link is single-use and expires in 48 hours.
                If you did not request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#334155;">
                &copy; 2026 GrowthRhythm OS by Gupio &bull;
                <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = `${config.heading}\n\nHi ${firstName},\n\n${config.intro}\n\n${config.buttonLabel}: ${magicLinkUrl}\n\nThis link is single-use and expires in 48 hours.`;

  return sendEmail({ to, subject: config.subject, html, text });
}

// ─── Task assigned email ──────────────────────────────────────────────────────

interface SendTaskAssignedEmailParams {
  to: string;
  assigneeName: string;
  assignedByName: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  dueDate?: Date | null;
  appUrl: string;
}

export async function sendTaskAssignedEmail({
  to,
  assigneeName,
  assignedByName,
  taskTitle,
  taskDescription,
  priority,
  dueDate,
  appUrl,
}: SendTaskAssignedEmailParams): Promise<boolean> {
  const firstName = assigneeName.split(' ')[0];

  const priorityColors: Record<string, string> = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#f59e0b',
    LOW: '#22c55e',
  };
  const priorityColor = priorityColors[priority] || '#94a3b8';
  const priorityLabel = priority.charAt(0) + priority.slice(1).toLowerCase();

  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Task Assigned</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;">
                    <span style="font-size:22px;line-height:44px;">&#9889;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p>
                    <p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
              <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#ffffff;">You have a new task</h1>
              <p style="margin:0 0 28px;font-size:14px;color:#94a3b8;">Hi ${firstName}, <strong style="color:#e2e8f0;">${assignedByName}</strong> has assigned you a task.</p>

              <!-- Task card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#f1f5f9;">${taskTitle}</p>
                    ${taskDescription ? `<p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.6;">${taskDescription}</p>` : ''}
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:16px;">
                          <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background-color:${priorityColor}20;color:${priorityColor};border:1px solid ${priorityColor}40;">
                            ${priorityLabel} priority
                          </span>
                        </td>
                        ${dueDateStr ? `
                        <td>
                          <span style="font-size:12px;color:#64748b;">&#128197; Due ${dueDateStr}</span>
                        </td>` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:10px;">
                    <a href="${appUrl}/tasks"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                      View Task
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;" />
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
                You received this because a task was assigned to you on GrowthRhythm OS.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#334155;">
                &copy; 2026 GrowthRhythm OS by Gupio &bull;
                <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = `Hi ${firstName},\n\n${assignedByName} has assigned you a new task on GrowthRhythm OS.\n\nTask: ${taskTitle}\nPriority: ${priorityLabel}${dueDateStr ? `\nDue: ${dueDateStr}` : ''}\n\nOpen the app to view it: ${appUrl}/tasks`;

  return sendEmail({ to, subject: `New task assigned: ${taskTitle}`, html, text });
}

// ─── Welcome email ───────────────────────────────────────────────────────────

interface SendWelcomeEmailParams {
  to: string;
  name: string;
  orgName: string;
}

export async function sendWelcomeEmail({ to, name, orgName }: SendWelcomeEmailParams): Promise<boolean> {
  const firstName = name.split(' ')[0];
  const subject = `Welcome to ${orgName} on GrowthRhythm OS`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;">
                    <span style="font-size:22px;line-height:44px;">&#9889;</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p>
                    <p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">Welcome aboard, ${firstName}!</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
                You are now part of <strong style="color:#e2e8f0;">${orgName}</strong> on GrowthRhythm OS.
                Your account is active and ready to go.
              </p>
              <ul style="margin:0 0 28px;padding-left:20px;color:#94a3b8;font-size:14px;line-height:1.8;">
                <li>Track your daily tasks and blockers</li>
                <li>Participate in structured standups</li>
              </ul>
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;" />
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
                If you have any questions, reach out to your manager or workspace admin.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#334155;">
                &copy; 2026 GrowthRhythm OS by Gupio &bull;
                <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = `Welcome aboard, ${firstName}!\n\nYou are now part of ${orgName} on GrowthRhythm OS. Your account is active and ready to go.`;

  return sendEmail({ to, subject, html, text });
}

// ─── Task due-date reminder email ─────────────────────────────────────────────

interface SendTaskReminderEmailParams {
  to: string;
  assigneeName: string;
  taskTitle: string;
  priority: string;
  dueDate: Date;
  appUrl: string;
}

export async function sendTaskDueTodayEmail({
  to, assigneeName, taskTitle, priority, dueDate, appUrl,
}: SendTaskReminderEmailParams): Promise<boolean> {
  const firstName = assigneeName.split(' ')[0];
  const dueDateStr = new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const subject = `Due today: "${taskTitle}"`;

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;"><span style="font-size:22px;line-height:44px;">&#9889;</span></td>
            <td style="padding-left:12px;vertical-align:middle;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p><p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p></td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f97316;">&#128197; Task due today</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">Hi ${firstName}, this task is due <strong style="color:#e2e8f0;">today (${dueDateStr})</strong>. Make sure it's done before EOD.</p>
          <div style="background-color:#0f172a;border-radius:12px;border:1px solid rgba(249,115,22,0.3);padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#f1f5f9;">${taskTitle}</p>
            <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background-color:#f9731620;color:#f97316;border:1px solid #f9731640;">${priority.charAt(0) + priority.slice(1).toLowerCase()} priority &bull; Due today</span>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr>
            <td style="background-color:#f97316;border-radius:10px;">
              <a href="${appUrl}/tasks" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Mark as Done</a>
            </td>
          </tr></table>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;"/>
          <p style="margin:0;font-size:12px;color:#475569;">You received this because a task assigned to you is due today.</p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;"><p style="margin:0;font-size:12px;color:#334155;">&copy; 2026 GrowthRhythm OS by Gupio &bull; <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a></p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  const text = `Hi ${firstName},\n\nYour task "${taskTitle}" (${priority.toLowerCase()} priority) is due TODAY — ${dueDateStr}. Please complete it before end of day.\n\nView it at: ${appUrl}/tasks`;
  return sendEmail({ to, subject, html, text });
}

export async function sendTaskDueReminderEmail({
  to, assigneeName, taskTitle, priority, dueDate, appUrl,
}: SendTaskReminderEmailParams): Promise<boolean> {
  const firstName = assigneeName.split(' ')[0];
  const dueDateStr = new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const subject = `Reminder: "${taskTitle}" is due tomorrow`;

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;"><span style="font-size:22px;line-height:44px;">&#9889;</span></td>
            <td style="padding-left:12px;vertical-align:middle;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p><p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p></td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f59e0b;">&#8987; Task due tomorrow</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">Hi ${firstName}, this task is due on <strong style="color:#e2e8f0;">${dueDateStr}</strong>.</p>
          <div style="background-color:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#f1f5f9;">${taskTitle}</p>
            <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background-color:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b40;">${priority.charAt(0) + priority.slice(1).toLowerCase()} priority</span>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr>
            <td style="background-color:#2563eb;border-radius:10px;">
              <a href="${appUrl}/tasks" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">View Task</a>
            </td>
          </tr></table>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;"/>
          <p style="margin:0;font-size:12px;color:#475569;">You received this because a task assigned to you is due soon.</p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;"><p style="margin:0;font-size:12px;color:#334155;">&copy; 2026 GrowthRhythm OS by Gupio &bull; <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a></p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  const text = `Hi ${firstName},\n\nThis is a reminder that your task "${taskTitle}" (${priority.toLowerCase()} priority) is due tomorrow — ${dueDateStr}.\n\nView it at: ${appUrl}/tasks`;
  return sendEmail({ to, subject, html, text });
}

// ─── Task overdue alert email ──────────────────────────────────────────────────

export async function sendTaskOverdueEmail({
  to, assigneeName, taskTitle, priority, dueDate, appUrl,
}: SendTaskReminderEmailParams): Promise<boolean> {
  const firstName = assigneeName.split(' ')[0];
  const dueDateStr = new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const subject = `Overdue: "${taskTitle}" was due ${dueDateStr}`;

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;"><span style="font-size:22px;line-height:44px;">&#9889;</span></td>
            <td style="padding-left:12px;vertical-align:middle;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p><p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p></td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ef4444;">&#9888; Task overdue</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">Hi ${firstName}, this task was due on <strong style="color:#e2e8f0;">${dueDateStr}</strong> and has not been completed.</p>
          <div style="background-color:#0f172a;border-radius:12px;border:1px solid rgba(239,68,68,0.3);padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#f1f5f9;">${taskTitle}</p>
            <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background-color:#ef444420;color:#ef4444;border:1px solid #ef444440;">${priority.charAt(0) + priority.slice(1).toLowerCase()} priority &bull; Overdue</span>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr>
            <td style="background-color:#ef4444;border-radius:10px;">
              <a href="${appUrl}/tasks" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Update Task Now</a>
            </td>
          </tr></table>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;"/>
          <p style="margin:0;font-size:12px;color:#475569;">Please update the task status or contact your manager.</p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;"><p style="margin:0;font-size:12px;color:#334155;">&copy; 2026 GrowthRhythm OS by Gupio &bull; <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a></p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  const text = `Hi ${firstName},\n\nYour task "${taskTitle}" was due on ${dueDateStr} and has not been completed. Please update it.\n\nView it at: ${appUrl}/tasks`;
  return sendEmail({ to, subject, html, text });
}

// ─── Feedback emails ───────────────────────────────────────────────────────────

const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  BUG: 'Bug', FEATURE_REQUEST: 'Feature Request', UI_UX: 'UI / UX',
  PERFORMANCE: 'Performance', OTHER: 'Other',
};

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', UNDER_REVIEW: 'Under Review', PLANNED: 'Planned',
  IMPLEMENTED: 'Implemented', DISMISSED: 'Dismissed',
};

export async function sendFeedbackReceivedEmail({
  to, ownerName, submitterName, department, title, category, appUrl,
}: {
  to: string; ownerName: string; submitterName: string;
  department: string | null; title: string; category: string; appUrl: string;
}): Promise<boolean> {
  const firstName = ownerName.split(' ')[0];
  const subject = `New app feedback from ${submitterName}`;

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding-bottom:32px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;"><span style="font-size:22px;line-height:44px;">&#9889;</span></td>
          <td style="padding-left:12px;vertical-align:middle;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p><p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">&#128172; New feedback received</h1>
        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">Hi ${firstName}, <strong style="color:#e2e8f0;">${submitterName}</strong>${department ? ` (${department})` : ''} submitted new app feedback.</p>
        <div style="background-color:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:20px 24px;margin-bottom:28px;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#f1f5f9;">${title}</p>
          <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background-color:#3b82f620;color:#3b82f6;border:1px solid #3b82f640;">${FEEDBACK_CATEGORY_LABELS[category] ?? category}</span>
        </div>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr>
          <td style="background-color:#2563eb;border-radius:10px;">
            <a href="${appUrl}/app-feedback" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">View Feedback</a>
          </td>
        </tr></table>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;"/>
        <p style="margin:0;font-size:12px;color:#475569;">You received this because you are an admin of this workspace.</p>
      </td></tr>
      <tr><td align="center" style="padding-top:24px;"><p style="margin:0;font-size:12px;color:#334155;">&copy; 2026 GrowthRhythm OS by Gupio &bull; <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a></p></td></tr>
    </table></td></tr>
  </table>
</body></html>`.trim();

  const text = `Hi ${firstName},\n\n${submitterName}${department ? ` (${department})` : ''} submitted new app feedback.\n\nTitle: ${title}\nCategory: ${FEEDBACK_CATEGORY_LABELS[category] ?? category}\n\nView it at: ${appUrl}/app-feedback`;
  return sendEmail({ to, subject, html, text });
}

export async function sendFeedbackStatusEmail({
  to, submitterName, title, status, appUrl,
}: {
  to: string; submitterName: string; title: string; status: string; appUrl: string;
}): Promise<boolean> {
  const firstName = submitterName.split(' ')[0];
  const statusLabel = FEEDBACK_STATUS_LABELS[status] ?? status;
  const subject = `Your feedback has been updated: ${statusLabel}`;

  const statusColors: Record<string, string> = {
    UNDER_REVIEW: '#3b82f6', PLANNED: '#8b5cf6',
    IMPLEMENTED: '#22c55e', DISMISSED: '#64748b', OPEN: '#f59e0b',
  };
  const color = statusColors[status] ?? '#64748b';

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding-bottom:32px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;"><span style="font-size:22px;line-height:44px;">&#9889;</span></td>
          <td style="padding-left:12px;vertical-align:middle;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p><p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Your feedback was updated</h1>
        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">Hi ${firstName}, the status of your feedback has been updated.</p>
        <div style="background-color:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:20px 24px;margin-bottom:28px;">
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#f1f5f9;">${title}</p>
          <span style="display:inline-block;padding:5px 14px;border-radius:8px;font-size:13px;font-weight:600;background-color:${color}20;color:${color};border:1px solid ${color}40;">&#10003; ${statusLabel}</span>
        </div>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;"/>
        <p style="margin:0;font-size:12px;color:#475569;">Thank you for helping improve GrowthRhythm OS.</p>
      </td></tr>
      <tr><td align="center" style="padding-top:24px;"><p style="margin:0;font-size:12px;color:#334155;">&copy; 2026 GrowthRhythm OS by Gupio &bull; <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a></p></td></tr>
    </table></td></tr>
  </table>
</body></html>`.trim();

  const text = `Hi ${firstName},\n\nYour feedback "${title}" has been updated to: ${statusLabel}.\n\nThank you for helping improve GrowthRhythm OS.`;
  return sendEmail({ to, subject, html, text });
}

// ─── Standup reminder email ────────────────────────────────────────────────────

export async function sendStandupReminderEmail({
  to, name, departmentName, standupTime, meetUrl, appUrl,
}: {
  to: string; name: string; departmentName: string;
  standupTime: string; meetUrl?: string | null; appUrl: string;
}): Promise<boolean> {
  const firstName = name.split(' ')[0];
  const subject = `Standup in 15 minutes — ${departmentName}`;

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding-bottom:32px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#2563eb;border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;"><span style="font-size:22px;line-height:44px;">&#9889;</span></td>
          <td style="padding-left:12px;vertical-align:middle;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">GrowthRhythm</p><p style="margin:0;font-size:11px;color:#93c5fd;">Business Operating System</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">&#9200; Standup in 15 minutes</h1>
        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">Hi ${firstName}, your <strong style="color:#e2e8f0;">${departmentName}</strong> standup starts at <strong style="color:#e2e8f0;">${standupTime}</strong>.</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>
          <td style="background-color:#2563eb;border-radius:10px;">
            <a href="${appUrl}/standup" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Open Standup</a>
          </td>
        </tr></table>
        ${meetUrl ? `<p style="margin:0 0 24px;font-size:13px;"><a href="${meetUrl}" style="color:#3b82f6;">Or join the meeting directly &#8594;</a></p>` : ''}
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 20px;"/>
        <p style="margin:0;font-size:12px;color:#475569;">You received this because your department standup is starting soon.</p>
      </td></tr>
      <tr><td align="center" style="padding-top:24px;"><p style="margin:0;font-size:12px;color:#334155;">&copy; 2026 GrowthRhythm OS by Gupio &bull; <a href="https://mygupio.com" style="color:#3b82f6;text-decoration:none;">mygupio.com</a></p></td></tr>
    </table></td></tr>
  </table>
</body></html>`.trim();

  const text = `Hi ${firstName},\n\nYour ${departmentName} standup starts at ${standupTime} — that's in about 15 minutes.\n\nOpen the app: ${appUrl}/standup${meetUrl ? `\nJoin meeting: ${meetUrl}` : ''}`;
  return sendEmail({ to, subject, html, text });
}
