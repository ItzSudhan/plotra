CREATE TABLE "writer_hour" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"words_added" integer DEFAULT 0 NOT NULL,
	"words_removed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "writer_hour_project_id_user_id_hour_pk" PRIMARY KEY("project_id","user_id","hour")
);
--> statement-breakpoint
ALTER TABLE "writer_hour" ADD CONSTRAINT "writer_hour_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writer_hour" ADD CONSTRAINT "writer_hour_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- A writer's own counts (apps/app/lib/stats-actions.ts `recordMyWriting`):
-- each person reads and writes only their own rows, in projects they can open.
GRANT SELECT, INSERT, UPDATE ON "writer_hour" TO plotra_app;--> statement-breakpoint
ALTER TABLE "writer_hour" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY writer_hour_own ON "writer_hour" TO plotra_app
  USING (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (user_id = plotra_current_user() AND project_id IN (SELECT plotra_user_projects()));
