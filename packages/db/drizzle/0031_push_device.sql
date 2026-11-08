CREATE TABLE "push_device" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_id" text NOT NULL,
	"expo_token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_device_expo_token_unique" UNIQUE("expo_token")
);
--> statement-breakpoint
ALTER TABLE "user_pref" ADD COLUMN "push_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_token_id_api_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_device_user_idx" ON "push_device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_device_token_idx" ON "push_device" USING btree ("token_id");--> statement-breakpoint

-- Each person sees and removes only their own phones. Registering and sending
-- go through the server's own connection (apps/app/lib/push.ts): a phone can
-- change hands, and whoever notifies is someone other than the recipient.
GRANT SELECT, DELETE ON "push_device" TO plotra_app;--> statement-breakpoint
ALTER TABLE "push_device" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY push_device_own ON "push_device" TO plotra_app
  USING (user_id = plotra_current_user())
  WITH CHECK (user_id = plotra_current_user());
