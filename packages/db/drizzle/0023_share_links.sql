-- A project can have several read-only links (apps/app/lib/share-actions.ts),
-- so a link gets an id of its own instead of being keyed by its project.
-- Existing links keep their token, and get an id here.
ALTER TABLE "share_link" DROP CONSTRAINT "share_link_pkey";--> statement-breakpoint
ALTER TABLE "share_link" ADD COLUMN "id" text;--> statement-breakpoint
UPDATE "share_link" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "share_link" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "share_link" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "share_link" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "share_link" ADD COLUMN "horizon_release_id" text;--> statement-breakpoint
ALTER TABLE "share_link" ADD COLUMN "canon_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "share_link" ADD COLUMN "listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_horizon_release_id_release_id_fk" FOREIGN KEY ("horizon_release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_link_project_idx" ON "share_link" USING btree ("project_id");
