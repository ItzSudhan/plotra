CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_id" text,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_project_idx" ON "chat_message" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_message_node_idx" ON "chat_message" USING btree ("node_id","created_at");--> statement-breakpoint

-- Row-level security, as for comments (0004): workspace isolation underneath
-- the app's own checks (apps/app/lib/chat-actions.ts), which also hold a note's
-- chat to the people who can see that note.
GRANT SELECT, INSERT, UPDATE, DELETE ON "chat_message" TO plotra_app;--> statement-breakpoint
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY chat_message_tenant ON "chat_message" TO plotra_app
  USING (project_id IN (SELECT plotra_user_projects()))
  WITH CHECK (project_id IN (SELECT plotra_user_projects()));
