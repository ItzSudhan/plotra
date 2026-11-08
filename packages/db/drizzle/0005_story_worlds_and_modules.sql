ALTER TYPE "public"."node_kind" ADD VALUE 'entity';--> statement-breakpoint
ALTER TYPE "public"."node_kind" ADD VALUE 'dialogue';--> statement-breakpoint
CREATE TABLE "entity_type" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"plural" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"builtin" text,
	"position" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"block_id" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"canon" text,
	"reveal" text,
	"channel" text,
	"layer" text,
	"claim" text,
	"claim_source_id" text
);
--> statement-breakpoint
CREATE TABLE "knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"character_node_id" text NOT NULL,
	"fact_node_id" text NOT NULL,
	"fact_block_id" text,
	"learned_in_node_id" text,
	"layer" text DEFAULT 'truth' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'book' NOT NULL,
	"date" text,
	"notes" text,
	"position" text NOT NULL,
	"node_id" text,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retcon" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"release_id" text,
	"reason" text NOT NULL,
	"version_id" text,
	"previous_canon" text,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_payoff" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text DEFAULT 'foreshadowing' NOT NULL,
	"title" text NOT NULL,
	"setup_node_id" text,
	"setup_block_id" text,
	"payoff_node_id" text,
	"payoff_block_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_stage" text,
	"note" text,
	"requested_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "questionnaire" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text,
	"title" text NOT NULL,
	"intro" text,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_response" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"questionnaire_id" text NOT NULL,
	"user_id" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text,
	"tag" text,
	"reviewer_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"r2_key" text,
	"data" "bytea",
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_term" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"term" text NOT NULL,
	"locale" text,
	"translation" text,
	"rule" text DEFAULT 'translate' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_state" (
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"block_id" text NOT NULL,
	"status" text DEFAULT 'written' NOT NULL,
	"note" text,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "line_state_node_id_block_id_pk" PRIMARY KEY("node_id","block_id")
);
--> statement-breakpoint
CREATE TABLE "string_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"category" text DEFAULT 'ui' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"char_limit" integer,
	"context" text,
	"node_id" text,
	"position" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation" (
	"project_id" text NOT NULL,
	"unit_key" text NOT NULL,
	"locale" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_hash" text,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translation_project_id_unit_key_locale_pk" PRIMARY KEY("project_id","unit_key","locale")
);
--> statement-breakpoint
-- A note's status becomes a stage id of the project's own workflow (was the enum draft/revised/final).
-- The default goes first, so nothing still refers to the enum when it's dropped below.
ALTER TABLE "node" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "node" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "node" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "world_id" text;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "entity_type_id" text;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "canon" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "reveal_release_id" text;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "reveal_channel" text;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "layer" text DEFAULT 'truth' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot_thread" ADD COLUMN "closed_node_id" text;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD COLUMN "reaction" text;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "release_id" text;--> statement-breakpoint
ALTER TABLE "entity_type" ADD CONSTRAINT "entity_type_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact" ADD CONSTRAINT "fact_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact" ADD CONSTRAINT "fact_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_character_node_id_node_id_fk" FOREIGN KEY ("character_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_fact_node_id_node_id_fk" FOREIGN KEY ("fact_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_learned_in_node_id_node_id_fk" FOREIGN KEY ("learned_in_node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retcon" ADD CONSTRAINT "retcon_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retcon" ADD CONSTRAINT "retcon_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retcon" ADD CONSTRAINT "retcon_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retcon" ADD CONSTRAINT "retcon_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retcon" ADD CONSTRAINT "retcon_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_payoff" ADD CONSTRAINT "setup_payoff_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_payoff" ADD CONSTRAINT "setup_payoff_setup_node_id_node_id_fk" FOREIGN KEY ("setup_node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_payoff" ADD CONSTRAINT "setup_payoff_payoff_node_id_node_id_fk" FOREIGN KEY ("payoff_node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_response" ADD CONSTRAINT "questionnaire_response_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_response" ADD CONSTRAINT "questionnaire_response_questionnaire_id_questionnaire_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaire"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_response" ADD CONSTRAINT "questionnaire_response_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rule" ADD CONSTRAINT "review_rule_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rule" ADD CONSTRAINT "review_rule_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rule" ADD CONSTRAINT "review_rule_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_term" ADD CONSTRAINT "glossary_term_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_state" ADD CONSTRAINT "line_state_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_state" ADD CONSTRAINT "line_state_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_state" ADD CONSTRAINT "line_state_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "string_entry" ADD CONSTRAINT "string_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "string_entry" ADD CONSTRAINT "string_entry_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation" ADD CONSTRAINT "translation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation" ADD CONSTRAINT "translation_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_type_project_idx" ON "entity_type" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "fact_node_idx" ON "fact" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "fact_project_idx" ON "fact" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "knowledge_project_idx" ON "knowledge" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "release_project_idx" ON "release" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "retcon_node_idx" ON "retcon" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "setup_payoff_project_idx" ON "setup_payoff" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_node_reviewer_idx" ON "approval" USING btree ("node_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "approval_project_idx" ON "approval" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "questionnaire_project_idx" ON "questionnaire" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questionnaire_response_user_idx" ON "questionnaire_response" USING btree ("questionnaire_id","user_id");--> statement-breakpoint
CREATE INDEX "review_rule_project_idx" ON "review_rule" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "attachment_node_idx" ON "attachment" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "glossary_term_project_idx" ON "glossary_term" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "line_state_project_idx" ON "line_state" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "string_entry_project_key_idx" ON "string_entry" USING btree ("project_id","key");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_world_id_project_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_entity_type_id_entity_type_id_fk" FOREIGN KEY ("entity_type_id") REFERENCES "public"."entity_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_reveal_release_id_release_id_fk" FOREIGN KEY ("reveal_release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_thread" ADD CONSTRAINT "plot_thread_closed_node_id_node_id_fk" FOREIGN KEY ("closed_node_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."node_status";--> statement-breakpoint
-- Row-level security for the new tables, as in 0003_rls: workspace isolation
-- underneath the app's can() policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "entity_type", "release", "fact", "knowledge", "setup_payoff", "retcon", "review_rule", "approval", "questionnaire", "questionnaire_response", "attachment", "line_state", "string_entry", "translation", "glossary_term"
TO plotra_app;--> statement-breakpoint
ALTER TABLE "entity_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY entity_type_tenant ON "entity_type" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "release" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY release_tenant ON "release" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "fact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY fact_tenant ON "fact" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "knowledge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY knowledge_tenant ON "knowledge" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "setup_payoff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY setup_payoff_tenant ON "setup_payoff" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "retcon" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY retcon_tenant ON "retcon" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "review_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY review_rule_tenant ON "review_rule" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "approval" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY approval_tenant ON "approval" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "questionnaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY questionnaire_tenant ON "questionnaire" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "questionnaire_response" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY questionnaire_response_tenant ON "questionnaire_response" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "attachment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY attachment_tenant ON "attachment" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "line_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY line_state_tenant ON "line_state" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "string_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY string_entry_tenant ON "string_entry" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "translation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY translation_tenant ON "translation" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));--> statement-breakpoint
ALTER TABLE "glossary_term" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY glossary_term_tenant ON "glossary_term" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));
