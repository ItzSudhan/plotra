CREATE TABLE "api_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_token_user_idx" ON "api_token" USING btree ("user_id");--> statement-breakpoint

-- Each person sees and manages only their own tokens. Checking a token that
-- arrives with a request happens before anyone is signed in, on the owner
-- connection, by its hash (apps/app/lib/api/tokens.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "api_token" TO plotra_app;--> statement-breakpoint
ALTER TABLE "api_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY api_token_own ON "api_token" TO plotra_app
  USING (user_id = plotra_current_user())
  WITH CHECK (user_id = plotra_current_user());
