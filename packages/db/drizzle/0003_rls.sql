-- Row-level security: workspace isolation underneath the app's can() policy.
--
-- The connection role (the database owner) bypasses RLS; it is used only for
-- Better Auth and trusted system work (the collab server's content sync). Every
-- request made on behalf of a user runs in a transaction that switches to
-- `plotra_app`, which has no BYPASSRLS, and sets `plotra.user_id`
-- (see packages/db/src/rls.ts). A query that forgets to do so as plotra_app
-- sees no rows at all, so mistakes fail closed.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plotra_app') THEN
    CREATE ROLE plotra_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT plotra_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO plotra_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "project", "node", "link", "property_def", "layout",
  "user_group", "group_member", "role", "grant", "clearance",
  "compartment", "compartment_member", "restricted_block"
TO plotra_app;--> statement-breakpoint
-- Identity tables stay owned by Better Auth; the app may read them (member lists, names).
GRANT SELECT ON "user", "member", "organization", "invitation" TO plotra_app;--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO plotra_app;--> statement-breakpoint
GRANT USAGE ON SEQUENCE "audit_log_id_seq" TO plotra_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION plotra_current_user() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('plotra.user_id', true), '') $$;--> statement-breakpoint

-- SECURITY DEFINER so the policies below can read memberships without
-- recursing into RLS themselves.
CREATE OR REPLACE FUNCTION plotra_user_orgs() RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT organization_id FROM member WHERE user_id = plotra_current_user() $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION plotra_user_projects() RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM project WHERE organization_id IN (SELECT plotra_user_orgs()) $$;--> statement-breakpoint

ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY project_tenant ON "project" TO plotra_app
  USING (organization_id IN (SELECT plotra_user_orgs()))
  WITH CHECK (organization_id IN (SELECT plotra_user_orgs()));--> statement-breakpoint

ALTER TABLE "node" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY node_tenant ON "node" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

ALTER TABLE "link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY link_tenant ON "link" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

ALTER TABLE "property_def" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY property_def_tenant ON "property_def" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

ALTER TABLE "restricted_block" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY restricted_block_tenant ON "restricted_block" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

-- Saved layouts are private to their owner.
ALTER TABLE "layout" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY layout_owner ON "layout" TO plotra_app
  USING (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

ALTER TABLE "user_group" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY user_group_tenant ON "user_group" TO plotra_app
  USING (organization_id IN (SELECT plotra_user_orgs()))
  WITH CHECK (organization_id IN (SELECT plotra_user_orgs()));--> statement-breakpoint

ALTER TABLE "group_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY group_member_tenant ON "group_member" TO plotra_app
  USING (group_id IN (SELECT id FROM user_group))
  WITH CHECK (group_id IN (SELECT id FROM user_group));--> statement-breakpoint

ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY role_tenant ON "role" TO plotra_app
  USING (organization_id IN (SELECT plotra_user_orgs()))
  WITH CHECK (organization_id IN (SELECT plotra_user_orgs()));--> statement-breakpoint

ALTER TABLE "grant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY grant_tenant ON "grant" TO plotra_app
  USING (organization_id IN (SELECT plotra_user_orgs()))
  WITH CHECK (organization_id IN (SELECT plotra_user_orgs()));--> statement-breakpoint

ALTER TABLE "clearance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY clearance_tenant ON "clearance" TO plotra_app
  USING (organization_id IN (SELECT plotra_user_orgs()))
  WITH CHECK (organization_id IN (SELECT plotra_user_orgs()));--> statement-breakpoint

ALTER TABLE "compartment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY compartment_tenant ON "compartment" TO plotra_app
  USING (organization_id IN (SELECT plotra_user_orgs()))
  WITH CHECK (organization_id IN (SELECT plotra_user_orgs()));--> statement-breakpoint

ALTER TABLE "compartment_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY compartment_member_tenant ON "compartment_member" TO plotra_app
  USING (compartment_id IN (SELECT id FROM compartment))
  WITH CHECK (compartment_id IN (SELECT id FROM compartment));--> statement-breakpoint

-- The audit log: members may append entries for their own workspaces and read them back.
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY audit_log_read ON "audit_log" FOR SELECT TO plotra_app
  USING (organization_id IN (SELECT plotra_user_orgs()));--> statement-breakpoint
CREATE POLICY audit_log_append ON "audit_log" FOR INSERT TO plotra_app
  WITH CHECK (
    actor_id = plotra_current_user()
    AND (organization_id IS NULL OR organization_id IN (SELECT plotra_user_orgs()))
  );--> statement-breakpoint

-- Append-only, for everyone including the owner role.
CREATE OR REPLACE FUNCTION plotra_audit_log_immutable() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;--> statement-breakpoint
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION plotra_audit_log_immutable();--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION plotra_audit_log_immutable();
