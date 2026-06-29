/**
 * Test script — sends all 3 report types to a given email address.
 * Usage: npx tsx src/scripts/test-report.ts [email]
 *
 * Example: npx tsx src/scripts/test-report.ts abhishek.kumar@mygupio.com
 */
import 'dotenv/config';
import prisma from '../lib/prisma';
import { buildOrgReport, renderReportHtml, renderReportText } from '../services/report.service';
import { sendEmail } from '../services/email.service';

const ORG_ID = process.env.TEST_ORG_ID || 'cmpkqgv71001zvzxstj19fr1f';
const TO_EMAIL = process.argv[2] || 'abhishek.kumar@mygupio.com';
const RECIPIENT_NAME = 'Abhishek Kumar';

async function run() {
  console.log(`\n[test-report] Sending all 3 report types to ${TO_EMAIL}\n`);

  for (const period of ['daily', 'weekly', 'monthly'] as const) {
    console.log(`  Building ${period} report…`);
    const report = await buildOrgReport(ORG_ID, period);
    const periodLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
    const subject = `[TEST] ${periodLabel} Performance Report — ${report.orgName}`;
    const html = renderReportHtml(report, 'OWNER', RECIPIENT_NAME, undefined, 'http://localhost:5173');
    const text = renderReportText(report);

    const ok = await sendEmail({ to: TO_EMAIL, subject, html, text });
    console.log(`  ${period} → ${ok ? 'sent ✓' : 'logged to console (SMTP not configured)'}`);
  }

  await prisma.$disconnect();
  console.log('\nDone.\n');
}

run().catch((e) => { console.error(e); process.exit(1); });
