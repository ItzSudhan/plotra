ALTER TYPE "public"."node_kind" ADD VALUE 'canvas';--> statement-breakpoint
ALTER TYPE "public"."node_kind" ADD VALUE 'timeline';--> statement-breakpoint
CREATE TABLE "calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plot_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text,
	"directed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_thread" (
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scene_thread_node_id_thread_id_pk" PRIMARY KEY("node_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "timeline_event" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"timeline_node_id" text NOT NULL,
	"node_id" text,
	"title" text NOT NULL,
	"description" text,
	"start" double precision NOT NULL,
	"end" double precision,
	"lane" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "comment_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"anchor" jsonb,
	"quote" text,
	"resolved_at" timestamp,
	"resolved_by_id" text,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"name" text,
	"auto" boolean DEFAULT false NOT NULL,
	"r2_key" text,
	"snapshot" "bytea",
	"size" bigint DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar" ADD CONSTRAINT "calendar_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_thread" ADD CONSTRAINT "plot_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_from_node_id_node_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_to_node_id_node_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_thread" ADD CONSTRAINT "scene_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_thread" ADD CONSTRAINT "scene_thread_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_thread" ADD CONSTRAINT "scene_thread_thread_id_plot_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."plot_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_timeline_node_id_node_id_fk" FOREIGN KEY ("timeline_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_thread_id_comment_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_project_idx" ON "calendar" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "plot_thread_project_idx" ON "plot_thread" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "relationship_project_idx" ON "relationship" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "scene_thread_project_idx" ON "scene_thread" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "timeline_event_timeline_idx" ON "timeline_event" USING btree ("timeline_node_id");--> statement-breakpoint
CREATE INDEX "comment_thread_idx" ON "comment" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "comment_thread_node_idx" ON "comment_thread" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "version_node_idx" ON "version" USING btree ("node_id","created_at");--> statement-breakpoint
-- Row-level security for the new tables, as in 0003_rls: workspace isolation
-- underneath the app's can() policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "plot_thread", "scene_thread", "relationship", "calendar", "timeline_event",
  "comment_thread", "comment", "version"
TO plotra_app;--> statement-breakpoint
ALTER TABLE "plot_thread" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY plot_thread_tenant ON "plot_thread" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "scene_thread" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY scene_thread_tenant ON "scene_thread" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "relationship" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY relationship_tenant ON "relationship" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "calendar" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY calendar_tenant ON "calendar" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "timeline_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY timeline_event_tenant ON "timeline_event" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "comment_thread" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY comment_thread_tenant ON "comment_thread" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY comment_tenant ON "comment" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY version_tenant ON "version" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));
