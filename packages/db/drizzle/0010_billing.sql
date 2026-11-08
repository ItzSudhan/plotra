CREATE TABLE "billing_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"workspace_id" text,
	"applied" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"creem_subscription_id" text NOT NULL,
	"creem_customer_id" text NOT NULL,
	"creem_product_id" text NOT NULL,
	"interval" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"creem_updated_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_creem_subscription_id_unique" UNIQUE("creem_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "agent_run" ADD COLUMN "credits" integer;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_customer_idx" ON "subscription" USING btree ("creem_customer_id");--> statement-breakpoint

-- Server-only tables: written from verified Creem webhooks and read when a limit is checked, always on
-- the server's own connection. No grant, and RLS on so a mistaken grant later still shows nothing.
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_event" ENABLE ROW LEVEL SECURITY;
