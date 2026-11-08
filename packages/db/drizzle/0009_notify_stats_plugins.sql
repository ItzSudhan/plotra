CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"actor_id" text,
	"verb" text NOT NULL,
	"node_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"type" text NOT NULL,
	"actor_id" text,
	"node_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp,
	"emailed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_pref" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_notifications" text DEFAULT 'daily' NOT NULL,
	"daily_goal" integer,
	"session_goal" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_hour" (
	"project_id" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"words_added" integer DEFAULT 0 NOT NULL,
	"words_removed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "writing_hour_project_id_hour_pk" PRIMARY KEY("project_id","hour")
);
--> statement-breakpoint
CREATE TABLE "plugin_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"version" text NOT NULL,
	"checksum" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"main" text,
	"styles" text,
	"main_key" text,
	"styles_key" text,
	"size" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_install" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"version" text NOT NULL,
	"source" text DEFAULT 'registry' NOT NULL,
	"dev_url" text,
	"manifest" jsonb NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"checksum" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "plugins_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pref" ADD CONSTRAINT "user_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_hour" ADD CONSTRAINT "writing_hour_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_install" ADD CONSTRAINT "plugin_install_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_install" ADD CONSTRAINT "plugin_install_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_project_idx" ON "activity" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_unsent_idx" ON "notification" USING btree ("emailed_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_asset_release_idx" ON "plugin_asset" USING btree ("plugin_id","version","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_install_owner_idx" ON "plugin_install" USING btree ("workspace_id","user_id","plugin_id");--> statement-breakpoint
CREATE INDEX "plugin_install_user_idx" ON "plugin_install" USING btree ("user_id");--> statement-breakpoint

-- Row-level security for the tables above (see 0003_rls and 0007).

-- The project's feed: anyone who can open the project reads it and adds to it. Rows are never changed.
GRANT SELECT, INSERT ON "activity" TO plotra_app;--> statement-breakpoint
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY activity_tenant ON "activity" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()) AND actor_id = plotra_current_user());--> statement-breakpoint

-- A notification is read and marked read by its recipient only. It is written by the person who did
-- the thing, in a project they can open; they can't read it back. Ones outside any project, and the
-- "emailed" mark, are written by the server's own connection.
GRANT SELECT, INSERT, UPDATE ON "notification" TO plotra_app;--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY notification_read ON "notification" FOR SELECT TO plotra_app
  USING (user_id = plotra_current_user());--> statement-breakpoint
CREATE POLICY notification_mark ON "notification" FOR UPDATE TO plotra_app
  USING (user_id = plotra_current_user())
  WITH CHECK (user_id = plotra_current_user());--> statement-breakpoint
CREATE POLICY notification_write ON "notification" FOR INSERT TO plotra_app
  WITH CHECK (actor_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "user_pref" TO plotra_app;--> statement-breakpoint
ALTER TABLE "user_pref" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY user_pref_owner ON "user_pref" TO plotra_app
  USING (user_id = plotra_current_user())
  WITH CHECK (user_id = plotra_current_user());--> statement-breakpoint

-- Written by the collab sync on the server's own connection; read by anyone who can open the project.
GRANT SELECT ON "writing_hour" TO plotra_app;--> statement-breakpoint
ALTER TABLE "writing_hour" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY writing_hour_read ON "writing_hour" FOR SELECT TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint

-- A person's own installs, in a workspace they belong to or have a project shared from.
GRANT SELECT, INSERT, UPDATE, DELETE ON "plugin_install" TO plotra_app;--> statement-breakpoint
ALTER TABLE "plugin_install" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY plugin_install_owner ON "plugin_install" TO plotra_app
  USING (user_id = plotra_current_user() AND workspace_id IN (SELECT plotra_user_workspaces()))
  WITH CHECK (user_id = plotra_current_user() AND workspace_id IN (SELECT plotra_user_workspaces()));--> statement-breakpoint

-- Server-only: release files are fetched, verified and served by the server's own connection.
ALTER TABLE "plugin_asset" ENABLE ROW LEVEL SECURITY;
