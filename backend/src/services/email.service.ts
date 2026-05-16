import { MagicLinkPurpose } from '@prisma/client';

// ─── SendGrid bootstrap ───────────────────────────────────────────────────────
// Using require() so the service degrades gracefully if the package is not yet installed.
// After running `pnpm install`, it will be available.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sgMail: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sgMail = require('@sendgrid/mail');
} catch {
  // Package not installed yet — dev console mode will be used
}

const apiKey = process.env.SENDGRID_API_KEY;
if (sgMail && apiKey) {
  sgMail.setApiKey(apiKey);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@growthrhythm.app';
const FROM_NAME = 'GrowthRhythm OS';

// ─── Generic send ────────────────────────────────────────────────────────────

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<boolean> {
  if (!apiKey || !sgMail) {
    // Dev mode: log instead of sending
    console.log('[email.service] DEV MODE — email not sent (no SENDGRID_API_KEY or package missing)');
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:    ${(text ?? html.replace(/<[^>]+>/g, ' ').trim()).slice(0, 300)}`);
    return false;
  }

  await sgMail.send({
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
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
          <!-- Logo -->
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

          <!-- Card -->
          <tr>
            <td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">${config.heading}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
                Hi ${firstName},<br/><br/>${config.intro}
              </p>

              <!-- CTA Button -->
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

              <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
                Or copy this link into your browser:
              </p>
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

          <!-- Footer -->
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
</html>
  `.trim();

  const text = `${config.heading}\n\nHi ${firstName},\n\n${config.intro}\n\n${config.buttonLabel}: ${magicLinkUrl}\n\nThis link is single-use and expires in 48 hours.`;

  return sendEmail({ to, subject: config.subject, html, text });
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
          <!-- Logo -->
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

          <!-- Card -->
          <tr>
            <td style="background-color:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">Welcome aboard, ${firstName}!</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
                You are now part of <strong style="color:#e2e8f0;">${orgName}</strong> on GrowthRhythm OS.
                Your account is active and ready to go.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
                Here is what you can do on GrowthRhythm OS:
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

          <!-- Footer -->
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
</html>
  `.trim();

  const text = `Welcome aboard, ${firstName}!\n\nYou are now part of ${orgName} on GrowthRhythm OS. Your account is active and ready to go.`;

  return sendEmail({ to, subject, html, text });
}
