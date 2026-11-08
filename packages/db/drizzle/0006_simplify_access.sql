ALTER TABLE "audit_log" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clearance" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "compartment" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "compartment_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grant" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "restricted_block" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_group" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "audit_log" CASCADE;--> statement-breakpoint
DROP TABLE "clearance" CASCADE;--> statement-breakpoint
DROP TABLE "compartment" CASCADE;--> statement-breakpoint
DROP TABLE "compartment_member" CASCADE;--> statement-breakpoint
DROP TABLE "grant" CASCADE;--> statement-breakpoint
DROP TABLE "group_member" CASCADE;--> statement-breakpoint
DROP TABLE "restricted_block" CASCADE;--> statement-breakpoint
DROP TABLE "role" CASCADE;--> statement-breakpoint
DROP TABLE "user_group" CASCADE;--> statement-breakpoint
ALTER TABLE "node" DROP CONSTRAINT IF EXISTS "node_compartment_id_compartment_id_fk";
--> statement-breakpoint
CREATE INDEX "node_search_idx" ON "node" USING gin ((setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', coalesce("synopsis", '')), 'B') || setweight(to_tsvector('english', "text"), 'C')));--> statement-breakpoint
ALTER TABLE "node" DROP COLUMN "classification";--> statement-breakpoint
ALTER TABLE "node" DROP COLUMN "compartment_id";--> statement-breakpoint
DROP TYPE "public"."grant_effect";--> statement-breakpoint
DROP TYPE "public"."grant_resource";--> statement-breakpoint
DROP TYPE "public"."grant_subject";--> statement-breakpoint
-- The audit log's append-only trigger function went with its table.
DROP FUNCTION IF EXISTS plotra_audit_log_immutable();
