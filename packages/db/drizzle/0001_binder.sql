CREATE TYPE "public"."node_kind" AS ENUM('folder', 'chapter', 'scene', 'note', 'character', 'location', 'research');--> statement-breakpoint
CREATE TYPE "public"."node_status" AS ENUM('draft', 'revised', 'final');--> statement-breakpoint
CREATE TABLE "node" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"parent_id" text,
	"kind" "node_kind" DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"position" text NOT NULL,
	"status" "node_status" DEFAULT 'draft' NOT NULL,
	"synopsis" text,
	"content" jsonb,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_parent_id_node_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "node_project_id_idx" ON "node" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "node_parent_id_idx" ON "node" USING btree ("parent_id");