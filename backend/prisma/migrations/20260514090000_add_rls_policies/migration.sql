-- Migration: 20260514090000_add_rls_policies
-- Enables Row-Level Security (RLS) on core tenant-scoped tables.
-- Policies are PERMISSIVE and allow full access when:
--   (a) the session variable app.current_org_id matches the row's org_id, OR
--   (b) the current DB user is the superuser 'abhishekkumar' (preserves Prisma dev access).
--
-- The superuser bypass ensures Prisma migrations and dev workflows are unaffected.
-- Application code must call: SET LOCAL app.current_org_id = '<orgId>'
-- at the start of each transaction (see src/middleware/rls.ts).

-- ──────────────────────────────────────────────
-- tasks
-- ──────────────────────────────────────────────
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'rls_tasks_org_isolation'
  ) THEN
    CREATE POLICY rls_tasks_org_isolation
      ON "tasks"
      AS PERMISSIVE
      FOR ALL
      USING (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      )
      WITH CHECK (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      );
  END IF;
END $$;

-- ──────────────────────────────────────────────
-- departments
-- ──────────────────────────────────────────────
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'departments' AND policyname = 'rls_departments_org_isolation'
  ) THEN
    CREATE POLICY rls_departments_org_isolation
      ON "departments"
      AS PERMISSIVE
      FOR ALL
      USING (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      )
      WITH CHECK (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      );
  END IF;
END $$;

-- ──────────────────────────────────────────────
-- kras
-- ──────────────────────────────────────────────
ALTER TABLE "kras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kras" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'kras' AND policyname = 'rls_kras_org_isolation'
  ) THEN
    CREATE POLICY rls_kras_org_isolation
      ON "kras"
      AS PERMISSIVE
      FOR ALL
      USING (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      )
      WITH CHECK (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      );
  END IF;
END $$;

-- ──────────────────────────────────────────────
-- standups
-- ──────────────────────────────────────────────
ALTER TABLE "standups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "standups" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'standups' AND policyname = 'rls_standups_org_isolation'
  ) THEN
    CREATE POLICY rls_standups_org_isolation
      ON "standups"
      AS PERMISSIVE
      FOR ALL
      USING (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      )
      WITH CHECK (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      );
  END IF;
END $$;

-- ──────────────────────────────────────────────
-- notifications
-- ──────────────────────────────────────────────
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'rls_notifications_org_isolation'
  ) THEN
    CREATE POLICY rls_notifications_org_isolation
      ON "notifications"
      AS PERMISSIVE
      FOR ALL
      USING (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      )
      WITH CHECK (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      );
  END IF;
END $$;

-- ──────────────────────────────────────────────
-- users
-- ──────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'rls_users_org_isolation'
  ) THEN
    CREATE POLICY rls_users_org_isolation
      ON "users"
      AS PERMISSIVE
      FOR ALL
      USING (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      )
      WITH CHECK (
        org_id = current_setting('app.current_org_id', true)
        OR current_user = 'abhishekkumar'
      );
  END IF;
END $$;
