CREATE TABLE "plugin_listing" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"author_id" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"access" text DEFAULT 'write' NOT NULL,
	"withdrawn_at" timestamp,
	"blocked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_listing_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "plugin_release" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"version" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"access" text DEFAULT 'write' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_plugin" ADD COLUMN "access" text DEFAULT 'write' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_plugin" ADD COLUMN "listing_id" text;--> statement-breakpoint
ALTER TABLE "user_plugin" ADD COLUMN "release_id" text;--> statement-breakpoint
ALTER TABLE "plugin_listing" ADD CONSTRAINT "plugin_listing_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_release" ADD CONSTRAINT "plugin_release_listing_id_plugin_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."plugin_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugin_listing_author_idx" ON "plugin_listing" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_release_version_idx" ON "plugin_release" USING btree ("listing_id","version");--> statement-breakpoint
CREATE INDEX "plugin_release_listing_idx" ON "plugin_release" USING btree ("listing_id","created_at");--> statement-breakpoint
ALTER TABLE "user_plugin" ADD CONSTRAINT "user_plugin_listing_id_plugin_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."plugin_listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plugin" ADD CONSTRAINT "user_plugin_release_id_plugin_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."plugin_release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_plugin_listing_idx" ON "user_plugin" USING btree ("listing_id");--> statement-breakpoint

-- The plugin store (plugin-store-plan.md). A listing is seen by everyone on
-- the server unless it was taken down; its author sees theirs either way. Only
-- the author changes it, and never `blocked_at` or who wrote it: those columns
-- aren't granted. Releases are added, never changed or deleted.
GRANT SELECT, INSERT ON "plugin_listing" TO plotra_app;--> statement-breakpoint
GRANT UPDATE ("name", "summary", "about", "category", "access", "withdrawn_at", "updated_at") ON "plugin_listing" TO plotra_app;--> statement-breakpoint
ALTER TABLE "plugin_listing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY plugin_listing_read ON "plugin_listing" FOR SELECT TO plotra_app
  USING (blocked_at IS NULL OR author_id = plotra_current_user());--> statement-breakpoint
CREATE POLICY plugin_listing_publish ON "plugin_listing" FOR INSERT TO plotra_app
  WITH CHECK (author_id = plotra_current_user() AND blocked_at IS NULL);--> statement-breakpoint
CREATE POLICY plugin_listing_edit ON "plugin_listing" FOR UPDATE TO plotra_app
  USING (author_id = plotra_current_user() AND blocked_at IS NULL)
  WITH CHECK (author_id = plotra_current_user());--> statement-breakpoint
GRANT SELECT, INSERT ON "plugin_release" TO plotra_app;--> statement-breakpoint
ALTER TABLE "plugin_release" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY plugin_release_read ON "plugin_release" FOR SELECT TO plotra_app
  USING (EXISTS (SELECT 1 FROM plugin_listing l WHERE l.id = listing_id));--> statement-breakpoint
CREATE POLICY plugin_release_publish ON "plugin_release" FOR INSERT TO plotra_app
  WITH CHECK (EXISTS (SELECT 1 FROM plugin_listing l WHERE l.id = listing_id AND l.author_id = plotra_current_user() AND l.blocked_at IS NULL));
