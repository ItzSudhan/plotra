ALTER TABLE "workspace_settings" ADD COLUMN "no_ai_since" timestamp;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "no_ai_by_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "no_ai_lifted_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "no_ai_lifted_by_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_no_ai_by_id_user_id_fk" FOREIGN KEY ("no_ai_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_no_ai_lifted_by_id_user_id_fk" FOREIGN KEY ("no_ai_lifted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;