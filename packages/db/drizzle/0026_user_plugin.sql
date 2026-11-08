CREATE TABLE "user_plugin" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_plugin" ADD CONSTRAINT "user_plugin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_plugin_user_idx" ON "user_plugin" USING btree ("user_id");--> statement-breakpoint

-- Each person sees and manages only their own plugins (apps/app/lib/plugin-actions.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_plugin" TO plotra_app;--> statement-breakpoint
ALTER TABLE "user_plugin" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY user_plugin_own ON "user_plugin" TO plotra_app
  USING (user_id = plotra_current_user())
  WITH CHECK (user_id = plotra_current_user());
