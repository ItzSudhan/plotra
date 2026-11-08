CREATE TABLE "git_sync" (
	"project_id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"token_sealed" text NOT NULL,
	"token_hint" text NOT NULL,
	"user_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"dirty_at" timestamp,
	"last_synced_at" timestamp,
	"last_commit" text,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "git_sync" ADD CONSTRAINT "git_sync_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_sync" ADD CONSTRAINT "git_sync_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Row-level security, as for webhooks (0022): workspace isolation underneath
-- the app's own check that only the project's managers see or change it
-- (apps/app/lib/git-sync-actions.ts). The sync itself runs on the owner
-- connection, as the person who set it up (apps/app/lib/git-sync.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "git_sync" TO plotra_app;--> statement-breakpoint
ALTER TABLE "git_sync" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY git_sync_tenant ON "git_sync" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));
