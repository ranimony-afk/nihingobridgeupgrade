CREATE TYPE "public"."identity_role" AS ENUM('learner', 'reviewer', 'content_editor', 'admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."identity_session_transport" AS ENUM('cookie', 'bearer');--> statement-breakpoint
CREATE TYPE "public"."identity_user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "identity_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"transport" "identity_session_transport" DEFAULT 'cookie' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_user_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" "identity_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"status" "identity_user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_credentials" ADD CONSTRAINT "identity_credentials_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_user_roles" ADD CONSTRAINT "identity_user_roles_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_credentials_user_idx" ON "identity_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_sessions_token_idx" ON "identity_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "identity_sessions_user_idx" ON "identity_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_sessions_expires_idx" ON "identity_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_roles_unique" ON "identity_user_roles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "identity_user_roles_role_idx" ON "identity_user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_users_email_lower_idx" ON "identity_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "identity_users_status_idx" ON "identity_users" USING btree ("status");