CREATE TYPE "public"."link_kind" AS ENUM('wiki', 'embed', 'property');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('text', 'number', 'date', 'select', 'multi_select', 'node', 'checkbox', 'url');--> statement-breakpoint
CREATE TYPE "public"."grant_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."grant_resource" AS ENUM('workspace', 'project', 'node');--> statement-breakpoint
CREATE TYPE "public"."grant_subject" AS ENUM('user', 'group', 'everyone');--> statement-breakpoint
CREATE TABLE "layout" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"target_heading" text,
	"kind" "link_kind" DEFAULT 'wiki' NOT NULL,
	"context" text,
	"ordinal" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_def" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_kind" "node_kind" NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "property_type" DEFAULT 'text' NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" text,
	"project_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clearance" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clearance_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "compartment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"nda_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compartment_member" (
	"compartment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"nda_accepted_at" timestamp,
	"added_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compartment_member_compartment_id_user_id_pk" PRIMARY KEY("compartment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "grant" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subject_type" "grant_subject" NOT NULL,
	"subject_id" text,
	"resource_type" "grant_resource" NOT NULL,
	"resource_id" text NOT NULL,
	"role_id" text NOT NULL,
	"effect" "grant_effect" DEFAULT 'allow' NOT NULL,
	"expires_at" timestamp,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_member_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "restricted_block" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text NOT NULL,
	"label" text,
	"classification" integer DEFAULT 0 NOT NULL,
	"compartment_id" text,
	"ydoc" "bytea",
	"text" text DEFAULT '' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"actions" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "properties" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "ydoc" "bytea";--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "headings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "content_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "classification" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "node" ADD COLUMN "compartment_id" text;--> statement-breakpoint
ALTER TABLE "layout" ADD CONSTRAINT "layout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout" ADD CONSTRAINT "layout_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_source_node_id_node_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_target_node_id_node_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_def" ADD CONSTRAINT "property_def_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance" ADD CONSTRAINT "clearance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance" ADD CONSTRAINT "clearance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartment" ADD CONSTRAINT "compartment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartment_member" ADD CONSTRAINT "compartment_member_compartment_id_compartment_id_fk" FOREIGN KEY ("compartment_id") REFERENCES "public"."compartment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartment_member" ADD CONSTRAINT "compartment_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartment_member" ADD CONSTRAINT "compartment_member_added_by_id_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant" ADD CONSTRAINT "grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant" ADD CONSTRAINT "grant_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_user_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restricted_block" ADD CONSTRAINT "restricted_block_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restricted_block" ADD CONSTRAINT "restricted_block_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restricted_block" ADD CONSTRAINT "restricted_block_compartment_id_compartment_id_fk" FOREIGN KEY ("compartment_id") REFERENCES "public"."compartment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restricted_block" ADD CONSTRAINT "restricted_block_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group" ADD CONSTRAINT "user_group_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "layout_user_project_name_idx" ON "layout" USING btree ("user_id","project_id","name");--> statement-breakpoint
CREATE INDEX "link_source_idx" ON "link" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "link_target_idx" ON "link" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "link_project_idx" ON "link" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_def_kind_key_idx" ON "property_def" USING btree ("project_id","node_kind","key");--> statement-breakpoint
CREATE INDEX "audit_log_org_at_idx" ON "audit_log" USING btree ("organization_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_resource_idx" ON "audit_log" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compartment_org_name_idx" ON "compartment" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "compartment_member_user_idx" ON "compartment_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "grant_org_idx" ON "grant" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "grant_resource_idx" ON "grant" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "group_member_user_idx" ON "group_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "restricted_block_node_idx" ON "restricted_block" USING btree ("node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_org_name_idx" ON "role" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "user_group_org_name_idx" ON "user_group" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_compartment_id_compartment_id_fk" FOREIGN KEY ("compartment_id") REFERENCES "public"."compartment"("id") ON DELETE set null ON UPDATE no action;