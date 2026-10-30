/* Phase 26F-B — SRS catalogue / learner-state separation (ADDITIVE ONLY).
 *
 * Prepared for, but NOT fixing, the critical SRS defect: `srs_decks.owner_id`
 * and `srs_cards.user_id` both default to the sentinel 'anonymous-user', so the
 * shared system catalogue and individual learners' rows are indistinguishable,
 * and seeded cards are single shared rows whose scheduling state every learner
 * mutates. This migration introduces the storage split only. It changes no
 * route's authorization and does NOT make legacy shared rows safe to grade.
 *
 * Deliberately NOT in this migration:
 *   - no dropping of the 'anonymous-user' column defaults (that needs a
 *     completed insert-path audit plus code that stops relying on them);
 *   - no UPDATE/backfill and no ownership reassignment of legacy rows;
 *   - no change to srs_reviews, srs_review_sessions or xp_events.
 *
 * Foreign keys are added only on the two NEW nullable columns, whose value is
 * NULL for every pre-existing row, so they cannot fail on pre-existing orphans.
 * The long-standing unconstrained relations (srs_cards.deck_id, ...) are left
 * exactly as they were.
 *
 * Generated with `drizzle-kit generate`, then this header was added.
 */

CREATE TABLE "srs_card_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"system_deck_id" text NOT NULL,
	"card_type" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"reading" text,
	"meaning" text,
	"hint" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"source_question_id" text,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_system_decks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"jlpt_level" text DEFAULT 'N5' NOT NULL,
	"scheduler_key" text NOT NULL,
	"scheduler_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"catalogue_version" integer DEFAULT 1 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "srs_cards" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "srs_decks" ADD COLUMN "system_deck_id" text;--> statement-breakpoint
ALTER TABLE "srs_card_templates" ADD CONSTRAINT "srs_card_templates_system_deck_id_srs_system_decks_id_fk" FOREIGN KEY ("system_deck_id") REFERENCES "public"."srs_system_decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_srs_card_templates_deck_content_unique" ON "srs_card_templates" USING btree ("system_deck_id","card_type","front");--> statement-breakpoint
CREATE INDEX "idx_srs_card_templates_deck" ON "srs_card_templates" USING btree ("system_deck_id");--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_template_id_srs_card_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."srs_card_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_decks" ADD CONSTRAINT "srs_decks_system_deck_id_srs_system_decks_id_fk" FOREIGN KEY ("system_deck_id") REFERENCES "public"."srs_system_decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_srs_cards_user_template_unique" ON "srs_cards" USING btree ("user_id","template_id") WHERE "template_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_srs_cards_user_deck" ON "srs_cards" USING btree ("user_id","deck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_srs_decks_owner_system_unique" ON "srs_decks" USING btree ("owner_id","system_deck_id") WHERE "system_deck_id" IS NOT NULL;