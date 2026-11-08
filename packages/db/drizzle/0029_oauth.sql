CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"client_uri" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_code" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scope" text NOT NULL,
	"resource" text,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "refresh_hash" text;--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "refresh_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_client_id_oauth_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_code_expires_idx" ON "oauth_code" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_client_id_oauth_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_refresh_hash_unique" UNIQUE("refresh_hash");--> statement-breakpoint

-- Apps that connect through OAuth, and the codes handed to them, are only ever
-- read by the server's own connection (apps/app/lib/api/oauth-server.ts): no
-- grant to plotra_app, and row-level security on in case one is ever added.
-- A connected app's tokens are rows of api_token, so each person still sees
-- and disconnects only their own (api_token_own).
ALTER TABLE "oauth_client" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth_code" ENABLE ROW LEVEL SECURITY;
