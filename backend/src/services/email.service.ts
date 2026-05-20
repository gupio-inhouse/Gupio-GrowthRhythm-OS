import nodemailer, { Transporter } from 'nodemailer';
import { MagicLinkPurpose } from '@prisma/client';

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

  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });
  return true;
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
                <li>View your team goals and KRAs</li>
                <li>Access your learning path</li>
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
