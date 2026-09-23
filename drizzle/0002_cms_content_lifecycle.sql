CREATE TABLE "cms_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"entity_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"staged_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_ref" text NOT NULL,
	"provenance_type" text NOT NULL,
	"original_source_ref" text,
	"author_id" text NOT NULL,
	"reviewer_id" text,
	"editorial_notes" text,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_content_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot_payload" jsonb NOT NULL,
	"status_at_snapshot" text NOT NULL,
	"created_by_id" text NOT NULL,
	"change_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cms_audit_log_item_occurred" ON "cms_audit_log" USING btree ("content_item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_cms_audit_log_actor_occurred" ON "cms_audit_log" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_cms_content_items_type_status" ON "cms_content_items" USING btree ("content_type","status");--> statement-breakpoint
CREATE INDEX "idx_cms_content_items_entity" ON "cms_content_items" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_cms_content_items_status_scheduled" ON "cms_content_items" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cms_content_versions_unique" ON "cms_content_versions" USING btree ("content_item_id","version_number");