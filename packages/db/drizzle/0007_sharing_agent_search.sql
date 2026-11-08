CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"invited_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_change" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text,
	"action" text NOT NULL,
	"before_version_id" text,
	"before" jsonb,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_message" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"thread_id" text,
	"user_id" text,
	"kind" text DEFAULT 'agent' NOT NULL,
	"mode" text DEFAULT 'ask' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_task" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"title" text NOT NULL,
	"mode" text DEFAULT 'suggest' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_key" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"base_url" text,
	"encrypted_key" text,
	"agent_model" text NOT NULL,
	"fast_model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"project_id" text,
	"properties" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_change" ADD CONSTRAINT "agent_change_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_change" ADD CONSTRAINT "agent_change_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_change" ADD CONSTRAINT "agent_change_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_change" ADD CONSTRAINT "agent_change_before_version_id_version_id_fk" FOREIGN KEY ("before_version_id") REFERENCES "public"."version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_thread_id_agent_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_thread_id_agent_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_thread_id_agent_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_thread" ADD CONSTRAINT "agent_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_thread" ADD CONSTRAINT "agent_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_key" ADD CONSTRAINT "ai_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_project_email_idx" ON "project_member" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "project_member_user_idx" ON "project_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_change_run_idx" ON "agent_change" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_message_thread_idx" ON "agent_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_workspace_idx" ON "agent_run" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_run_thread_idx" ON "agent_run" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "agent_task_project_user_idx" ON "agent_task" USING btree ("project_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "agent_thread_project_user_idx" ON "agent_thread" USING btree ("project_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "event_name_at_idx" ON "event" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "event_user_idx" ON "event" USING btree ("user_id");--> statement-breakpoint

-- Row-level security for the tables above, and for sharing (plan.md 2.9): a
-- project is visible to its workspace's members and to the people it is shared
-- with (`project_member`), who may be guests from outside the workspace. Every
-- project-scoped policy goes through plotra_user_projects(), so widening that
-- one function opens exactly the shared project to a guest and nothing else.

CREATE OR REPLACE FUNCTION plotra_user_projects() RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT id FROM project WHERE organization_id IN (SELECT plotra_user_orgs())
    UNION
    SELECT project_id FROM project_member WHERE user_id = plotra_current_user()
  $$;--> statement-breakpoint

-- Workspaces whose settings the user's requests depend on: their own, and those of projects shared with them.
CREATE OR REPLACE FUNCTION plotra_user_workspaces() RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT organization_id FROM member WHERE user_id = plotra_current_user()
    UNION
    SELECT p.organization_id FROM project p
      INNER JOIN project_member pm ON pm.project_id = p.id
      WHERE pm.user_id = plotra_current_user()
  $$;--> statement-breakpoint

DROP POLICY project_tenant ON "project";--> statement-breakpoint
-- New projects are checked against the workspace: a row being inserted isn't in plotra_user_projects() yet.
CREATE POLICY project_tenant ON "project" TO plotra_app
  USING (id IN (SELECT plotra_user_projects()))
  WITH CHECK (organization_id IN (SELECT plotra_user_orgs()) OR id IN (SELECT plotra_user_projects()));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "project_member", "ai_key", "agent_thread", "agent_message", "agent_run", "agent_change", "agent_task"
TO plotra_app;--> statement-breakpoint
-- Workspace settings are written by the server's own connection, after its own admin check.
GRANT SELECT ON "workspace_settings" TO plotra_app;--> statement-breakpoint

ALTER TABLE "project_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY project_member_tenant ON "project_member" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

-- A user's own model key, their conversations with the agent and their long jobs are theirs alone.
ALTER TABLE "ai_key" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ai_key_owner ON "ai_key" TO plotra_app
  USING (user_id = plotra_current_user())
  WITH CHECK (user_id = plotra_current_user());--> statement-breakpoint
ALTER TABLE "agent_thread" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY agent_thread_owner ON "agent_thread" TO plotra_app
  USING (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "agent_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY agent_message_owner ON "agent_message" TO plotra_app
  USING (thread_id IN (SELECT id FROM agent_thread))
  WITH CHECK (thread_id IN (SELECT id FROM agent_thread));--> statement-breakpoint
ALTER TABLE "agent_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY agent_task_owner ON "agent_task" TO plotra_app
  USING (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

-- Runs and what they changed are part of the project's history, like versions.
ALTER TABLE "agent_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY agent_run_tenant ON "agent_run" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "agent_change" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY agent_change_tenant ON "agent_change" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

ALTER TABLE "workspace_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspace_settings_read ON "workspace_settings" FOR SELECT TO plotra_app
  USING (workspace_id IN (SELECT plotra_user_workspaces()));--> statement-breakpoint

-- Server-only tables: no grant, and RLS on so a mistaken grant later still shows nothing.
ALTER TABLE "event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "throttle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;
