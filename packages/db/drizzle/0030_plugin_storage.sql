ALTER TABLE "user_plugin" ADD COLUMN "official_slug" text;--> statement-breakpoint
ALTER TABLE "user_plugin" ADD COLUMN "storage" jsonb DEFAULT '{}'::jsonb NOT NULL;