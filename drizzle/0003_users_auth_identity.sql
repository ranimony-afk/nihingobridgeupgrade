ALTER TABLE "users" ADD COLUMN "auth_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_subject" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'learner' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_auth_identity_unique" ON "users" USING btree ("auth_provider","auth_subject");