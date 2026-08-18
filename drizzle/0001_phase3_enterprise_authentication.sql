CREATE TABLE "auth_action_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text,
	"type" varchar(48) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text,
	"event" varchar(96) NOT NULL,
	"ip_address" varchar(128),
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution_members" (
	"institution_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(32) DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_members_institution_id_user_id_pk" PRIMARY KEY("institution_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"subscription_status" varchar(32) DEFAULT 'trialing' NOT NULL,
	"plan" varchar(64) DEFAULT 'starter' NOT NULL,
	"subscription_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"user_agent" text,
	"ip_address" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"institution_id" text,
	"status" varchar(32) DEFAULT 'trialing' NOT NULL,
	"plan" varchar(64) DEFAULT 'starter' NOT NULL,
	"seat_count" integer DEFAULT 1 NOT NULL,
	"current_period_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"secret_encrypted" text NOT NULL,
	"enabled_at" timestamp with time zone,
	"last_used_step" integer,
	"recovery_code_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"permission" varchar(128) NOT NULL,
	"granted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'student';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ip_address" varchar(128);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" varchar(32) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_action_tokens" ADD CONSTRAINT "auth_action_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor_credentials" ADD CONSTRAINT "two_factor_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_action_tokens_hash_unique" ON "auth_action_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_action_tokens_user_type_idx" ON "auth_action_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "auth_action_tokens_expires_idx" ON "auth_action_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_audit_events_user_idx" ON "auth_audit_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_audit_events_event_created_idx" ON "auth_audit_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "institution_members_user_idx" ON "institution_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_slug_unique" ON "institutions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "institutions_subscription_status_idx" ON "institutions" USING btree ("subscription_status");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_unique" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_institution_idx" ON "subscriptions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_credentials_locked_until_idx" ON "user_credentials" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permission_override_unique" ON "user_permission_overrides" USING btree ("user_id","permission");--> statement-breakpoint
CREATE INDEX "user_permission_overrides_user_idx" ON "user_permission_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");