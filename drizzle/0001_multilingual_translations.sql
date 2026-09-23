CREATE TABLE IF NOT EXISTS "entity_translations" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"language" text NOT NULL,
	"translated_text" text NOT NULL,
	"secondary_text" text,
	"context_notes" text,
	"source_type" text NOT NULL,
	"source_ref" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_entity_translations_unique" ON "entity_translations" USING btree ("entity_type","entity_id","language","translated_text");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entity_translations_lookup" ON "entity_translations" USING btree ("entity_type","entity_id","language");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entity_translations_reverse" ON "entity_translations" USING btree ("language","translated_text");
