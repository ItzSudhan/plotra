CREATE TABLE "share_link" (
	"project_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "share_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Managers switch the link on and off as themselves; the public page looks a
-- token up on the server's own connection, since its reader has no account.
GRANT SELECT, INSERT, UPDATE, DELETE ON "share_link" TO plotra_app;--> statement-breakpoint
ALTER TABLE "share_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY share_link_tenant ON "share_link" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));
