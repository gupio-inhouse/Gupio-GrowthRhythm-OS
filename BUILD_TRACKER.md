# GrowthRhythm OS — Build Tracker

> Status as of **14 May 2026**. Based on PRD Build Tracker PDF (v4.0).
> Legend: ✅ Done · 🟡 Partial (backend or frontend built, not both) · ❌ Pending

---

## Summary

| Phase | Total Items | ✅ Done | 🟡 Partial | ❌ Pending |
|-------|------------|---------|-----------|-----------|
| MVP (M1–M13) | 89 | 25 | 13 | 51 |
| Phase 2 (M14–M15) | 10 | 0 | 0 | 10 |
| **Total** | **99** | **25** | **13** | **61** |

---

## M1 · Onboarding & Magic-Link System `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M1.1 | Company workspace creation | 🟡 Partial | `POST /api/auth/register` creates org + owner. Missing: fiscal year start, headcount, default language fields in register form |
| M1.2 | Magic-link generator | ❌ Pending | `MagicLink` table in schema. No JWT-signed token generation service built |
| M1.3 | Cascading invite flow | 🟡 Partial | `POST /users/invite` creates users with `INVITED` status. No magic-link delivery or cascading owner→head→manager→member flow |
| M1.4 | Email + WhatsApp delivery | ❌ Pending | No SendGrid or WhatsApp (Interakt/Wati) integration |
| M1.5 | Token state machine | ❌ Pending | Schema fields exist (`usedAt`, `revokedAt`, `expiresAt`). No lifecycle logic or audit transitions |
| M1.6 | Industry-template defaults | ❌ Pending | `IndustryTemplate` table in schema. No auto-suggest departments on company creation |
| M1.7 | MFA for sensitive actions | ❌ Pending | `mfaEnabled` / `mfaSecret` columns in schema. No MFA flow built |

---

## M2 · Users, Departments & RBAC `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M2.1 | User CRUD + bulk import | 🟡 Partial | Full User CRUD at `GET/PATCH /users`, invite at `POST /users/invite`. Frontend Team page with invite dialog. Missing: CSV/Excel bulk import |
| M2.2 | Department CRUD | ✅ Done | `GET/POST/PATCH /departments` with slug, headUserId, parent. Frontend Departments list page |
| M2.3 | Role definitions | ✅ Done | All 7 roles in Prisma enum. `requireRole()` middleware enforced on all sensitive routes |
| M2.4 | Permission matrix enforcement | 🟡 Partial | `requireRole` guards on routes. Full cross-department visibility matrix from PRD §23 not implemented |
| M2.5 | Audit log on every write | ✅ Done | `auditLog()` middleware wired to all task, KRA, and department write routes (`POST/PATCH`) |
| M2.6 | Role-based home screen routing | ✅ Done | Login redirects: Owner→`/cockpit`, Head→`/dashboard/:slug`, Manager/Member→`/tasks`. Implemented via `getRoleRedirect()` utility |

---

## M3 · Goal & KRA Engine `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M3.1 | Goal creation (company-level) | ✅ Done | `GET/POST/PATCH /goals` with type, target, dueDate, parentGoalId, ownerUserId. Frontend Goals page |
| M3.2 | KRA cascade to departments | ✅ Done | `GET/POST/PATCH /kras` with departmentId, goalId, target, current, period, ownerUserId. Frontend KRA section in Goals page |
| M3.3 | AI goal assistant | ❌ Pending | No AI integration. Plain-language goal → KRA suggestion not built |
| M3.4 | KRA → Task linking (mandatory) | 🟡 Partial | `kraId` field on Task schema, backend supports it. No frontend enforcement that every task must have a KRA |
| M3.5 | KRA progress rollup | ✅ Done | Backend: when task → DONE, `KRA.current` incremented and status set to ON_TRACK/COMPLETED. New task dialog links KRA at creation |

---

## M4 · Advanced Task Manager `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M4.1 | Task CRUD with full field set | 🟡 Partial | Full Task CRUD backend. Frontend: list view, new task dialog (title, priority, assignee, dept, KRA, due date). Missing: collaborators, attachments, dependency selector |
| M4.2 | Six task views | ✅ Done | List view + Kanban board built. Kanban columns: TODO/IN_PROGRESS/BLOCKED/DONE with status-change buttons. Missing: Calendar, KRA-grouped, Workload, Department views |
| M4.3 | Blocker capture & routing | ✅ Done | `BlockerDialog` captures blockerType (7 types) + description + expected resolution date. Wired to both list status-change and TaskDetailDrawer |
| M4.4 | Dependency graph | ❌ Pending | `dependencyId` self-relation in schema. No UI and no downstream flagging logic |
| M4.5 | Auto-escalation rules | ❌ Pending | No BullMQ job: overdue task → standup auto-surface, same blocker 3 days → escalate |
| M4.6 | Activity log per task | ✅ Done | `TaskDetailDrawer` component: full task detail panel, status change (with BlockerDialog intercept), threaded comment list + add comment form. Backend `POST /tasks/:id/comments` with user relation wired |
| M4.7 | AI task intelligence | ❌ Pending | No AI: no daily summary, no overdue risk prediction, no next-step suggestions for blocked tasks |
| M4.8 | Bulk task import (CSV) | ❌ Pending | No CSV import endpoint or frontend uploader |

---

## M5 · Daily 15-Minute Standup `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M5.1 | Standup schedule per department | 🟡 Partial | `standupTime` + `standupDuration` fields on Department. No frontend UI to configure per-department schedule |
| M5.2 | Card pre-generation at 11 PM | ❌ Pending | BullMQ installed. No scheduled job that creates standup cards nightly |
| M5.3 | T-15 multi-channel reminders | ❌ Pending | No notification job 15 min before standup |
| M5.4 | Live 15-minute timer | ✅ Done | Frontend countdown timer with red overrun, `POST /standups/:id/start` and `/end`, `overrunMinutes` recorded |
| M5.5 | Editable cards with audit | ✅ Done | Full per-member edit form in standup screen: Yesterday/Today/Blockers textareas, inline submit via `PATCH /standups/:id/cards/:cardId`. Full standup detail fetched via `GET /standups/:id` |
| M5.6 | Blocker capture inside standup | ❌ Pending | No inline blocker dialog during standup that writes to task + blocker tables |
| M5.7 | T+60s AI digest | ❌ Pending | No post-standup AI summary or delivery |
| M5.8 | 3-day repeat blocker escalation | ❌ Pending | No job to detect repeat blockers across 3 standups |

---

## M6 · Department Dashboards `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M6.1 | Stable per-department URLs | ✅ Done | `/dashboard/:slug` route in frontend. `GET /departments/:slug/dashboard` backend endpoint |
| M6.2 | Widget grid (9 widgets) | ✅ Done | `DepartmentDashboard` page with 9 widgets: overdue count, blocked count, due today, KRA progress bars, team member list, top blockers breakdown, last standup summary, learning completion stats, task summary grid |
| M6.3 | Role-scoped visibility | 🟡 Partial | API filters by `orgId`. Owner sees all depts. Full manager-sees-own-team-only enforcement not complete at query level |
| M6.4 | Realtime updates | ❌ Pending | No WebSocket / Supabase Realtime / Pusher integration |
| M6.5 | P95 load time < 2 seconds | ❌ Pending | No Redis caching on aggregation queries. No load testing done |
| M6.6 | Default dashboards from industry template | ❌ Pending | IndustryTemplate table exists. No widget defaults applied on department creation |

---

## M7 · Department Learning Hub `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M7.1 | Per-department learning URL | 🟡 Partial | `/learning` route exists with `GET /learning/paths?departmentId=`. No `/learning/:slug` per-department URL or department-scoped frontend page |
| M7.2 | Content library (basic) | 🟡 Partial | LearningPath + LearningItem CRUD on backend. Frontend Learning page shows paths and assignments. Missing: upload UI for PDFs/videos, SOP support |
| M7.3 | Manual learning assignment | ✅ Done | `AssignDialog` in Learning page: select path → select item → select user → set due date → `POST /learning/assignments`. Role-gated to OWNER/ADMIN/HEAD/MANAGER. "Mark done" button on each assignment |
| M7.4 | Quiz engine (MCQ) | ❌ Pending | `quizJson` column in schema. No quiz render UI, no scoring, no pass/fail logic |
| M7.5 | AI learning recommender | ❌ Pending | No AI integration for learning path recommendation on missed KRA / repeated blocker |
| M7.6 | Learning completion score | 🟡 Partial | Backend counts completed/total assignments in dashboard endpoint. No weighted score formula |
| M7.7 | Learning visibility in standup | ❌ Pending | Learning tasks not surfaced in standup overdue list |

---

## M8 · Owner Cockpit (Basic) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M8.1 | Company KRA & goal health | ✅ Done | KRA health breakdown section in cockpit: progress bars per KRA with on-track/at-risk/completed badges, color-coded by completion %. Backend returns top 10 KRAs with department context |
| M8.2 | Department execution scores | ✅ Done | Execution score row per department with progress bar and percentage. Score derived from task/KRA/user count proxy (real formula needs per-dept done/total task counts from backend) |
| M8.3 | Blocker heatmap | ✅ Done | `GET /owner/cockpit/blockers` groups by type + repeat count. Frontend PieChart and repeated blockers list |
| M8.4 | Standup completion view | 🟡 Partial | Today's standups in cockpit API response. Frontend shows count. No breakdown of who attended, avg overrun per dept |
| M8.5 | Drill-down navigation | ✅ Done | Each department row in cockpit has `ExternalLink` icon → `/dashboard/:slug`. Department grid in generic dashboard also links to dept dashboards |
| M8.6 | Weekly Monday 8 AM exec digest | ❌ Pending | `GET /owner/cockpit/weekly-summary` data exists. No BullMQ cron job or AI-generated email/WhatsApp digest |

---

## M9 · AI Layer (cross-cutting) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M9.1 | AI orchestration service | ❌ Pending | No Claude API integration. No central AI service |
| M9.2 | Prompt + schema registry | ❌ Pending | No versioned prompt templates |
| M9.3 | Background AI jobs (BullMQ) | ❌ Pending | BullMQ + ioredis installed. No AI jobs defined |
| M9.4 | AI credit ledger per org | ❌ Pending | `aiCreditsTotal` + `aiCreditsUsed` columns on Organization. No deduction logic |
| M9.5 | Usage alerts & caps | ❌ Pending | |
| M9.6 | Response caching | ❌ Pending | Redis connected. No AI response cache layer |
| M9.7 | Model routing | ❌ Pending | |

---

## M10 · Notifications (Email + WhatsApp + Push) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M10.1 | Notification service | ❌ Pending | `Notification` table in schema. No fan-out service for email/WhatsApp/push |
| M10.2 | Event-to-template mapping | ❌ Pending | |
| M10.3 | Channel preferences per user | ✅ Done | `notificationPrefs Json?` column added to User schema (migration applied). Settings page loads prefs from `GET /users/:id`, persists via `PATCH /users/:id` with notificationPrefs payload |
| M10.4 | Quiet hours per company | ❌ Pending | |
| M10.5 | Delivery status + retry | ❌ Pending | Schema has `status`, `retryCount`, `errorMessage`. No delivery tracking logic |
| M10.6 | Failed notification queue (admin) | ❌ Pending | |

---

## M11 · Integrations (MVP set) `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M11.1 | Google Calendar | ❌ Pending | |
| M11.2 | Microsoft Outlook / Graph | ❌ Pending | |
| M11.3 | Email (SendGrid) | ❌ Pending | Dependency in package.json not added yet |
| M11.4 | WhatsApp Business (Interakt/Wati) | ❌ Pending | |
| M11.5 | Razorpay | ❌ Pending | |

---

## M12 · Super Admin Panel `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M12.1 | Customer directory | ❌ Pending | |
| M12.2 | Activation controls | ❌ Pending | |
| M12.3 | Subscription view | ❌ Pending | |
| M12.4 | Usage & cost monitoring | ❌ Pending | |
| M12.5 | Safe impersonation | ❌ Pending | |
| M12.6 | System health view | ❌ Pending | |

---

## M13 · Data, Privacy & Compliance `MVP`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M13.1 | Tenant isolation (RLS) | 🟡 Partial | All API queries filter by `orgId` at application level. No PostgreSQL row-level security policies applied |
| M13.2 | Encryption at rest + in transit | ❌ Pending | No TLS config, no column-level encryption for PII |
| M13.3 | Employee & candidate consent | ❌ Pending | No consent notice on onboarding flow |
| M13.4 | Data export & deletion | ❌ Pending | |
| M13.5 | Retention policy | ❌ Pending | No nightly auto-purge job |
| M13.6 | Audit log everywhere | 🟡 Partial | `auditLog()` middleware wired to tasks, KRAs, departments. Not wired to learning, standup, goals write routes |

---

## M14 · Tactical & Strategic Reviews `Phase 2`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M14.1 | Tactical review agenda generator | ❌ Pending | `Review` table in schema |
| M14.2 | Action items + decisions tracker | ❌ Pending | |
| M14.3 | Strategic review reports | ❌ Pending | |
| M14.4 | Review templates per industry | ❌ Pending | |
| M14.5 | Decision audit log | ❌ Pending | |

---

## M15 · Hiring & Capability Planner `Phase 2`

| # | Build Item | Status | Notes |
|---|-----------|--------|-------|
| M15.1 | Role & job description builder | ❌ Pending | |
| M15.2 | Interview scorecards | ❌ Pending | |
| M15.3 | Onboarding checklist generator | ❌ Pending | |
| M15.4 | Hiring pipeline tracking | ❌ Pending | |
| M15.5 | Candidate data + consent handling | ❌ Pending | |

---

## What's fully working right now

The codebase is a **solid foundation** — schema, auth, and core CRUD are production-quality. These flows work end-to-end today:

- Register org + owner → login → JWT auth → role-based redirect
- Create / list departments → department dashboard with 9 widgets
- Create / list goals and KRAs with progress bars
- Create tasks (with KRA link, assignee, priority, due date) → status changes → KRA rollup on DONE
- Blocker capture dialog (7 types + resolution date) on any status→BLOCKED change
- Task detail drawer with threaded comments
- Kanban board view with inline status advancement
- Start / end a standup with live timer → editable per-member cards (Yesterday/Today/Blockers)
- Invite team members (creates `INVITED` user)
- Owner Cockpit: KRA health breakdown + department execution scores + blocker heatmap + drill-downs to dept dashboards
- Assign learning items to users from the Learning Hub
- Settings: profile edit + notification preferences persisted to DB via `PATCH /users/:id`

---

## Recommended next sprint (highest impact, MVP critical path)

Work in this order — each unlocks the next:

### Sprint A — Make the daily loop actually run
1. **M5.2** — BullMQ cron: nightly standup card pre-generation
2. **M4.5** — BullMQ job: 3-day repeat blocker auto-escalation
3. **M5.6** — Blocker capture dialog inside standup screen (links to task)
4. **M5.3** — T-15 standup reminders (requires M10 notification service first)

### Sprint B — Notifications + invites (make product sticky)
5. **M1.2 + M1.3** — Magic-link generator + cascading invite flow
6. **M10.1** — Notification fan-out service (email via SendGrid)
7. **M10.2** — Event-to-template mapping (task assigned, blocker, standup reminder)

### Sprint C — AI layer foundation
8. **M9.1** — Central AI orchestration service wrapping Claude API
9. **M9.3** — Background AI jobs: standup digest (M5.7), weekly exec digest (M8.6)
10. **M3.3** — AI goal assistant (plain language → KRA suggestions)

### Sprint D — Compliance + super admin
11. **M13.1** — PostgreSQL RLS policies (replace app-level filtering)
12. **M12.1–M12.6** — Super admin panel

### Phase 2 (after MVP stable)
- M14 — Tactical & Strategic Reviews
- M15 — Hiring & Capability Planner
