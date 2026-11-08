CREATE TABLE "webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_delivery_at" timestamp,
	"last_status" integer,
	"last_error" text,
	"failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_project_idx" ON "webhook" USING btree ("project_id");--> statement-breakpoint

-- Row-level security, as for comments (0004): workspace isolation underneath
-- the app's own check that only the project's managers see or change its
-- webhooks (apps/app/lib/webhook-actions.ts). Deliveries are made on the
-- owner connection (apps/app/lib/webhooks.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "webhook" TO plotra_app;--> statement-breakpoint
ALTER TABLE "webhook" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY webhook_tenant ON "webhook" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));
