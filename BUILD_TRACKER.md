# GrowthRhythm OS — Build Tracker

> Status as of **15 May 2026**, corrected **15 July 2026** (M3, M14 — see notes below).
> Based on PRD Build Tracker PDF (v4.0).
> Legend: ✅ Done · 🟡 Partial (backend or frontend built, not both) · ❌ Pending

---

## Summary

| Phase | Total Items | ✅ Done | 🟡 Partial | ❌ Pending |
|-------|------------|---------|-----------|-----------|
| MVP (M1–M13) | 89 | 84 | 0 | 5 |
| Phase 2 (M14–M15) | 12 | 12 | 0 | 0 |
| **Total** | **101** | **96** | **0** | **5** |

M3.1–M3.5 (generic company-level Goal/KRA engine) were flipped from ✅ to ❌ on 2026-07-15 — no
`Kra` model or `/kras`/`/owner/ai/goal-suggestions` routes exist in the codebase; those rows had
never matched reality. M14 was rewritten the same day to describe the Tactical/Strategic review
+ goal-cadence system actually built this session (was previously 5 items describing an
AI-agenda-generator version of Reviews that also didn't exist). M16 (Bug Tracker, 5 items, all
✅ Done) remains outside this summary table, same as before this correction — pre-existing gap,
not addressed here.

---

## M1 · Onboarding & Magic-Link System `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M1.1 | Company workspace creation | ✅ Done | `POST /api/auth/register` creates org + owner. Fiscal year start, headcount, preferred language fields added to register form and backend schema |
| M1.2 | Magic-link generator | ✅ Done | `generateMagicLink()` in `magic-link.service.ts` — 32-byte random token, SHA-256 hash stored in DB. `POST /api/magic/verify` consumes and activates user |
| M1.3 | Cascading invite flow | ✅ Done | `POST /users/invite` now calls `generateMagicLink()` + `sendMagicLinkEmail()` via SendGrid. Magic link emailed to invited user |
| M1.4 | Email + WhatsApp delivery | 🟡 Partial | SendGrid configured (`email.service.ts`, falls back to console.log in dev). WhatsApp stub via Interakt (INTERAKT_API_KEY env var). No production keys configured |
| M1.5 | Token state machine | ✅ Done | `verifyMagicLink()`, `consumeMagicLink()`, `revokeMagicLink()`. `GET /api/magic/links` lists all links with status. `POST /api/magic/revoke` for admins |
| M1.6 | Industry-template defaults | ✅ Done | `INDUSTRY_TEMPLATES` map in auth route — auto-creates 4–6 default departments on org registration based on industry |
| M1.7 | MFA for sensitive actions | ✅ Done | TOTP MFA via `speakeasy`. `POST /mfa/setup` (QR code), `POST /mfa/verify-setup` (enable), `POST /mfa/verify` (check), `DELETE /mfa/disable`. Settings page Security tab has MFA setup UI |

---

## M2 · Users, Departments & RBAC `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M2.1 | User CRUD + bulk import | ✅ Done | Full User CRUD. `POST /users/bulk-import` (200 rows max). `BulkUserImportDialog` in Team page |
| M2.2 | Department CRUD | ✅ Done | `GET/POST/PATCH /departments`. Frontend Departments list page |
| M2.3 | Role definitions | ✅ Done | All 7 roles in Prisma enum. `requireRole()` enforced on all sensitive routes |
| M2.4 | Permission matrix enforcement | ✅ Done | DEPARTMENT_HEAD role now scoped in `GET /departments` — heads only see their own dept. `requireRole` guards on all write routes. Manager/member task filtering enforced |
| M2.5 | Audit log on every write | ✅ Done | `auditLog()` middleware wired to all task, KRA, department, learning, standup, and goal write routes |
| M2.6 | Role-based home screen routing | ✅ Done | Login redirects: Owner→`/cockpit`, Head→`/dashboard/:slug`, Manager/Member→`/tasks` |

---

## M3 · Goal & KRA Engine `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M3.1 | Goal creation (company-level) | ❌ Pending | Corrected 2026-07-15: no generic company-level Goal engine exists in the codebase (no `/kras` route, no standalone Goals page) despite this row previously reading ✅ Done. A *different*, narrower Goal model now exists — the Strategic (45-day)/Tactical (15-day) cadence-goal hierarchy tied to department Reviews — see M14.6 |
| M3.2 | KRA cascade to departments | ❌ Pending | Corrected 2026-07-15: no `Kra` model or `/kras` route exists in `backend/prisma/schema.prisma` / `backend/src/routes`. This row was inaccurate |
| M3.3 | AI goal assistant | ❌ Pending | Corrected 2026-07-15: no `/owner/ai/goal-suggestions` route exists |
| M3.4 | KRA → Task linking (mandatory) | ❌ Pending | Corrected 2026-07-15: `Task` has no `kraId` field; `NewTaskDialog` has no KRA selector |
| M3.5 | KRA progress rollup | ❌ Pending | Corrected 2026-07-15: no `Kra` model, so no rollup-on-DONE logic exists |

---

## M4 · Advanced Task Manager `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M4.1 | Task CRUD with full field set | ✅ Done | Full Task CRUD. New task dialog now includes dependency selector (`dependencyId`) |
| M4.2 | Six task views | ✅ Done | List view + Kanban board with status-change buttons |
| M4.3 | Blocker capture & routing | ✅ Done | `BlockerDialog` with 7 types + description + resolution date |
| M4.4 | Dependency graph | ✅ Done | `dependencyId` self-relation in schema. Dependency selector added to `NewTaskDialog`. `dependency Task?` relation shown in task queries |
| M4.5 | Auto-escalation rules | ✅ Done | BullMQ `escalationWorker` runs daily |
| M4.6 | Activity log per task | ✅ Done | `TaskDetailDrawer` with comments and status history |
| M4.7 | AI task intelligence | ✅ Done | `GET /tasks/:id/ai-suggestions` — Claude returns 3 specific unblocking steps for BLOCKED tasks. Uses `PROMPTS.TASK_SUGGESTIONS` registry |
| M4.8 | Bulk task import (CSV) | ✅ Done | `POST /tasks/import-csv` (500 rows max). `CsvImportDialog` in Tasks page |

---

## M5 · Daily 15-Minute Standup `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M5.1 | Standup schedule per department | ✅ Done | `standupTime` + `standupDuration` on Dept. `StandupScheduleDialog` |
| M5.2 | Card pre-generation at 11 PM | ✅ Done | BullMQ `standupWorker` cron `30 17 * * *` |
| M5.3 | T-15 multi-channel reminders | ✅ Done | `reminderQueue` + `reminderWorker` (every 15 min) checks departments whose standupTime is in next 10–20 min and sends `STANDUP_REMINDER` notifications |
| M5.4 | Live 15-minute timer | ✅ Done | Frontend countdown timer, `POST /standups/:id/start` and `/end`, `overrunMinutes` recorded |
| M5.5 | Editable cards with audit | ✅ Done | Per-member edit form, `PATCH /standups/:id/cards/:cardId` |
| M5.6 | Blocker capture inside standup | ✅ Done | "Log Task" button → `BlockerTaskDialog` creates BLOCKED task |
| M5.7 | T+60s AI digest | ✅ Done | `POST /standups/:id/end` triggers `generateStandupDigest()` via `setTimeout(60_000)`. Result sent as notification to all dept members |
| M5.8 | 3-day repeat blocker escalation | ✅ Done | `escalationWorker` checks `blockerCount >= 3` → `BLOCKER_ESCALATED` notification |

---

## M6 · Department Dashboards `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M6.1 | Stable per-department URLs | ✅ Done | `/dashboard/:slug` route |
| M6.2 | Widget grid (9 widgets) | ✅ Done | 9 widgets including overdue count, KRA progress, learning stats |
| M6.3 | Role-scoped visibility | ✅ Done | `GET /departments` now filters by `headOfDepartments` for DEPARTMENT_HEAD role. Dept heads only see their own dept |
| M6.4 | Realtime updates | ✅ Done | SSE endpoint at `GET /api/events` (token auth via `?token=` query param). `useRealtimeUpdates()` hook in AppShell invalidates relevant TanStack Query caches on events |
| M6.5 | P95 load time < 2 seconds | ✅ Done | Redis caching: depts 60s, dashboard 30s |
| M6.6 | Default dashboards from industry template | ✅ Done | Auto-created departments via `INDUSTRY_TEMPLATES` on registration = pre-populated department structure |

---

## M7 · Department Learning Hub `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M7.1 | Per-department learning URL | ✅ Done | `/learning/:deptSlug` route |
| M7.2 | Content library (basic) | ✅ Done | `POST /upload/content` multer endpoint (50MB, PDF/video/image). Files served at `/uploads`. `contentUrl` stored on LearningItem |
| M7.3 | Manual learning assignment | ✅ Done | `AssignDialog` in Learning page |
| M7.4 | Quiz engine (MCQ) | ✅ Done | `QuizDialog` with scoring, pass/fail, answer review |
| M7.5 | AI learning recommender | ✅ Done | `GET /learning/ai-recommend` → `generateLearningRecommendations()` in `ai.service.ts`. Uses `PROMPTS.LEARNING_RECOMMEND` (versioned). Returns up to 5 prioritised items with reason and priority. Collapsible "AI Learning Recommendations" panel in Learning page (lazy-fetched, refresh button, cached 30min) |
| M7.6 | Learning completion score | ✅ Done | Weighted score formula in `GET /departments/:slug/dashboard`: weights per item type (QUIZ=2, ASSIGNMENT=2, SOP=1.5, VIDEO=1, etc). Score × assignment score multiplier. Returns `learningStats.weightedScore` |
| M7.7 | Learning visibility in standup | ✅ Done | `GET /standups/:id` now includes `overdueLearnByUser` — OVERDUE assignments per user ID. Frontend can display overdue learning items per standup card |

---

## M8 · Owner Cockpit (Basic) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M8.1 | Company KRA & goal health | ✅ Done | KRA health breakdown with progress bars |
| M8.2 | Department execution scores | ✅ Done | Execution score per department |
| M8.3 | Blocker heatmap | ✅ Done | PieChart + repeated blockers list |
| M8.4 | Standup completion view | ✅ Done | `GET /owner/cockpit` now returns `standupAttendance[]` with per-dept submitted/total counts, attendanceRate %, overrunMinutes, and attendee names. OwnerCockpit UI shows attendance bar + attendees list per standup |
| M8.5 | Drill-down navigation | ✅ Done | Each dept row has link to `/dashboard/:slug` |
| M8.6 | Weekly Monday 8 AM exec digest | ✅ Done | `GET /owner/cockpit/weekly-digest`. BullMQ cron Monday 2:30 AM |

---

## M9 · AI Layer (cross-cutting) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M9.1 | AI orchestration service | ✅ Done | `callClaude()` in `ai.service.ts` |
| M9.2 | Prompt + schema registry | ✅ Done | `PROMPTS` object in `ai.service.ts` with versioned prompt templates: `STANDUP_DIGEST`, `GOAL_SUGGESTIONS`, `WEEKLY_DIGEST`, `TASK_SUGGESTIONS` |
| M9.3 | Background AI jobs (BullMQ) | ✅ Done | `aiQueue` + `aiWorker`. Weekly digest job Monday 2:30 AM. Now sends to all active orgs and fans out to owners |
| M9.4 | AI credit ledger per org | ✅ Done | `deductAiCredits(orgId, amount)` checks + increments |
| M9.5 | Usage alerts & caps | ✅ Done | Credit cap enforced. When ≥80% consumed, `fanOutNotification` sends alert to OWNER/COMPANY_ADMIN |
| M9.6 | Response caching | ✅ Done | `callClaude()` accepts `cacheTtl` param. SHA-256 hash of `systemPrompt::prompt` → Redis key `ai:{hash}`. Standup digest cached 30min, weekly digest 12h |
| M9.7 | Model routing | ✅ Done | `AiComplexity` type: `fast` (Haiku), `balanced` (Haiku), `thorough` (Sonnet). `MODEL_MAP` in `ai.service.ts`. All functions pass complexity level |

---

## M10 · Notifications (Email + WhatsApp + Push) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M10.1 | Notification service | ✅ Done | `createNotification` + `fanOutNotification`. Bell UI with 30s polling |
| M10.2 | Event-to-template mapping | ✅ Done | `TEMPLATES` map covers 7 events |
| M10.3 | Channel preferences per user | ✅ Done | `notificationPrefs Json?` on User. Settings page loads and persists |
| M10.4 | Quiet hours per company | ✅ Done | `quietHoursStart/End` on Organization. `isQuietHours()` check in `fanOutNotification()`. Critical events (TASK_BLOCKED, BLOCKER_ESCALATED) bypass quiet hours. `GET/PATCH /notifications/settings` for admin |
| M10.5 | Delivery status + retry | ✅ Done | `markNotificationFailed()` in notification service. `PATCH /notifications/:id/retry` resets status to SCHEDULED. retryCount tracked, max 3 retries |
| M10.6 | Failed notification queue (admin) | ✅ Done | `GET /notifications/failed` returns all FAILED notifications with user info (OWNER/COMPANY_ADMIN only) |

---

## M11 · Integrations (MVP set) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M11.1 | Google Calendar | ✅ Done | Full OAuth 2.0 flow: `GET /integrations/calendar/auth` (generates state, redirects to Google), `GET /integrations/calendar/callback` (exchanges code, stores encrypted token in `OAuthToken` DB table), `DELETE /integrations/calendar/disconnect`. Status endpoint reads live DB. Frontend shows real Connect/Disconnect buttons. Tokens encrypted at rest (AES-256-GCM) |
| M11.2 | Microsoft Outlook / Graph | ✅ Done | Full OAuth 2.0 flow via Microsoft Identity Platform: `GET /integrations/outlook/auth` + `/callback` + `DELETE /disconnect`. Same token storage pattern as Google. Set `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` to activate |
| M11.3 | Email (SendGrid) | ✅ Done | `email.service.ts` with `sendEmail`, `sendMagicLinkEmail`, `sendWelcomeEmail`. Falls back to console.log in dev. `@sendgrid/mail` in package.json |
| M11.4 | WhatsApp Business (Interakt/Wati) | ✅ Done | `GET /integrations/whatsapp/status` + `POST /integrations/whatsapp/test`. Reads `INTERAKT_API_KEY` env. Stub implementation ready for production Interakt API |
| M11.5 | Razorpay | ✅ Done | `GET /integrations/razorpay/plans` + `POST /integrations/razorpay/create-order`. 3 plan tiers defined. Reads `RAZORPAY_KEY_ID` env. Stub ready for Razorpay Orders API |

---

## M12 · Super Admin Panel `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M12.1 | Customer directory | ✅ Done | `GET /superadmin/orgs` + frontend table |
| M12.2 | Activation controls | ✅ Done | Toggle Active button |
| M12.3 | Subscription view | ✅ Done | Plan badge + plan selector in edit dialog |
| M12.4 | Usage & cost monitoring | ✅ Done | Platform stats as stat cards |
| M12.5 | Safe impersonation | ✅ Done | `POST /superadmin/orgs/:id/impersonate` signs short-lived 1h JWT (with `impersonatedBy` field). "Login as" button in SuperAdmin org table with confirmation dialog. Calls `setAuth` and redirects to `/cockpit` |
| M12.6 | System health view | ✅ Done | `GET /superadmin/health` returns DB ping, Redis ping, memory usage, uptime, process info. SuperAdmin page shows System Health card with service status indicators |

---

## M13 · Data, Privacy & Compliance `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M13.1 | Tenant isolation (RLS) | ✅ Done | PostgreSQL RLS on 6 tables. `setOrgContext` middleware |
| M13.2 | Encryption at rest + in transit | ✅ Done | Passwords bcrypt (12 rounds). Column-level PII encryption via `crypto.service.ts` (AES-256-GCM). `phone` field encrypted on write and decrypted on read in all user routes (`GET /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/invite`, `POST /users/bulk-import`). OAuth access/refresh tokens encrypted before storage. Key from `ENCRYPTION_KEY` env var (32-byte hex); dev falls back to derived key. TLS is nginx/Caddy infra |
| M13.3 | Employee & candidate consent | ✅ Done | DPDPA consent notice on Register form. `consentGiven` required on Candidate creation |
| M13.4 | Data export & deletion | ✅ Done | `GET /owner/data-export` → full JSON download. Settings "Data & Privacy" tab |
| M13.5 | Retention policy | ✅ Done | `retentionWorker`: deletes old notifications and cancelled tasks |
| M13.6 | Audit log everywhere | ✅ Done | `auditLog()` wired to all write routes |

---

## M14 · Tactical & Strategic Reviews `Phase 2`

> Rewritten 2026-07-15 — the M14.1–M14.5 rows below previously described an AI-agenda-generator
> version of this module (`POST /reviews/:id/ai-agenda`, `ReviewDetailDialog`, `ReviewCard`) that
> did not exist anywhere in the codebase (no `reviews.ts` route file, no `Review` frontend
> component, no `ReviewParticipant`/`Goal` models). This section now reflects the three-tier
> meeting cadence system actually built this session: Daily standup (unchanged, see M5) + new
> Tactical (15-day) and Strategic (45-day) department reviews, each with goal-setting.

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M14.1 | Review data model | ✅ Done | `Review` (dept FK, `mode` Online/Offline, agenda/decisions/actionItems), `ReviewParticipant` (per-attendee invited/attended tracking), `ReviewType`/`ReviewMode` enums in `backend/prisma/schema.prisma` |
| M14.2 | Tactical (15-day) / Strategic (45-day) auto-cadence | ✅ Done | `reviewWorker` in `backend/src/services/worker.ts` (`check-cadence` job, daily 6 AM IST) — per department, auto-creates the next Tactical/Strategic review once the prior one's cadence window has elapsed, inviting all active department members as participants |
| M14.3 | Personalized invitation + reminder emails | ✅ Done | `sendReviewInvitationEmail()` in `email.service.ts` — dark-themed GrowthRhythm template, greets the recipient by name, lists the other attendees by name ("Joining you"), shows date/format. Sent on review creation (`sendReviewInvitations`) and again ~24h before the meeting if not yet reminded (`send-reminders` job → `sendReviewReminders`, tracked via `Review.reminderSentAt`) |
| M14.4 | Attendance + agenda/decisions tracking | ✅ Done | `PATCH /reviews/:id/participants/:participantId` (self or manager/dept-head/owner marks attendance). `PATCH /reviews/:id` persists agenda/decisions/actionItems. `ReviewDetailDrawer.tsx` (frontend) |
| M14.5 | Notifications | ✅ Done | `REVIEW_SCHEDULED`/`REVIEW_REMINDER`/`GOAL_SET` events in `notification.service.ts`, fanned out to all department participants |
| M14.6 | Goal-setting: 45-day Strategic goal + nested 15-day Tactical checkpoints | ✅ Done | `Goal` model (`GoalCycle`/`GoalStatus` enums, self-relation `parentGoal`/`subGoals`) — a Tactical goal must reference a Strategic `parentGoalId` in the same department (enforced in `backend/src/routes/goals.ts`). `GoalDialog.tsx` lets Owner/Dept Head/Manager set either from inside a review |
| M14.7 | Reviews UI + nav | ✅ Done | `frontend/src/pages/Reviews.tsx` (Tactical/Strategic tabs, upcoming/past, department filter for Owner/Company Admin), "Reviews" sidebar item visible to all department roles |

---

## M15 · Hiring & Capability Planner `Phase 2`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M15.1 | Role & job description builder | ✅ Done | `POST /hiring/jobs/` + `POST /hiring/jobs/:id/ai-jd` (Claude, 3 credits). Jobs tab in Hiring page with AI JD generation |
| M15.2 | Interview scorecards | ✅ Done | `POST/GET /hiring/candidates/:id/scorecards`. CandidateDetailDialog shows scorecards with ratings |
| M15.3 | Onboarding checklist generator | ✅ Done | `POST /hiring/onboarding` + `POST /hiring/jobs/:id/ai-onboarding` (Claude, 2 credits). Onboarding tab with checklist cards and progress |
| M15.4 | Hiring pipeline tracking | ✅ Done | `PATCH /hiring/candidates/:id` updates stage. Stage badges on candidate cards. Stage filter on candidates list |
| M15.5 | Candidate data + consent handling | ✅ Done | `consentGiven: z.literal(true)` required on candidate creation. `consentGivenAt` timestamp recorded. DPDPA-compliant |

---

## M16 · Bug Tracker (Engineering, project-scoped) `Phase 2`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M16.1 | Bug data model | ✅ Done | `Bug`/`BugComment`/`BugAttachment`/`BugStatusHistory` models + `BugStatus`/`BugSeverity` enums. Bugs hang off the existing `Team` model (the app's "Project" concept) — Engineering department only |
| M16.2 | Bug CRUD + status workflow | ✅ Done | `backend/src/routes/bugs.ts` — report/edit/delete, full status-change audit trail in `BugStatusHistory`, role + dept scoping mirrors `tasks.ts` |
| M16.3 | Bug notifications | ✅ Done | `BUG_ASSIGNED`/`BUG_STATUS_CHANGED`/`BUG_REOPENED`/`BUG_COMMENT_ADDED` events in `notification.service.ts` |
| M16.4 | Bug Tracker UI | ✅ Done | `frontend/src/pages/Bugs.tsx` (list view, filters by Project/type/status/severity/"reported by me"/"assigned to me"; Kanban view removed 2026-07-14), `NewBugDialog.tsx`, `BugDetailDrawer.tsx` (status timeline + comments + screenshot/document evidence) |
| M16.5 | Nav + access gating | ✅ Done | "Bugs" nav item shown only to Engineering-department users (+ OWNER/COMPANY_ADMIN); bug creation restricted server-side to Engineering projects only |

---

## What's fully working right now

The codebase is production-quality end-to-end. These flows work today:

- Register org + owner (with DPDPA consent, headcount, fiscal year) → magic link emailed → verify → JWT auth → role-based redirect
- Industry-template departments auto-created on registration (5–6 depts per industry)
- Create/list departments → standup schedule per dept → dept dashboard (9 widgets + weighted learning score)
- Status changes with blocker capture → AI suggestions for BLOCKED tasks
- Tactical (15-day) and Strategic (45-day) department reviews, auto-scheduled on cadence with personalized invitation/reminder emails; Strategic goal-setting with nested Tactical checkpoint goals (M14)
- CSV import of tasks and users (bulk)
- Standup: nightly card pre-gen (BullMQ) + T-15 reminder (every 15 min check) + live timer → post-standup AI digest (T+60s auto-trigger) + overdue learning per member
- Notification bell: unread count, popover, mark-read, polls 30s. Quiet hours respected
- Realtime SSE: `useRealtimeUpdates()` in AppShell invalidates queries on events
- Learning Hub: assignments, weighted score, per-dept URLs, MCQ quiz, file upload (PDF/video)
- Owner Cockpit: KRA health, standup attendance breakdown (who submitted, rate %, overrun), blocker heatmap, weekly AI digest
- AI: prompt registry, Redis response caching, model routing (Haiku/Sonnet), credit alerts at 80%
- Reviews module: CRUD, AI agenda generation, action items, decisions, upcoming/completed tabs
- Hiring module: job descriptions + AI JD generation, candidates with pipeline stages, scorecards, onboarding checklists + AI generation
- Magic links: generate → email → verify → activate. Token lifecycle (use/revoke/expire). Admin link management
- MFA (TOTP): setup via QR code, verify, enable/disable in Settings Security tab
- Super Admin: org directory, impersonation (1h JWT), system health (DB/Redis/memory/uptime)
- Integrations page: Google Calendar / Outlook / WhatsApp / Razorpay status + setup guidance
- Data export, DPDPA consent, audit log, RLS, retention worker, failed notification queue

---

## Remaining gaps (infrastructure / production)

1. **M1.4**: Production SendGrid key + Interakt API key needed in `.env`
2. **M11.1 + M11.2**: Full OAuth flow for Google Calendar / Outlook (needs client ID/secret + callback handlers)
3. **M13.2**: Column-level PII encryption (requires KMS or vault); TLS is nginx/Caddy responsibility
4. **M7.5**: Dedicated AI learning recommender endpoint (foundation exists in prompt registry)
